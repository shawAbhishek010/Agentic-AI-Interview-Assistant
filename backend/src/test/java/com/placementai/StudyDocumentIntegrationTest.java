package com.placementai;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.http.MediaType;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"debug=false","spring.datasource.url=jdbc:h2:mem:study-tests;DB_CLOSE_DELAY=-1","spring.jpa.hibernate.ddl-auto=create-drop"}) @AutoConfigureMockMvc
class StudyDocumentIntegrationTest {
    @Autowired MockMvc mvc;@Autowired ObjectMapper mapper;@MockitoBean AgentClient agent;
    String token;
    @BeforeEach void setup() throws Exception {
        token=demo();
        when(agent.extractDocument(any(),anyString())).thenReturn(Map.of("title","My private notes","file_name","notes.txt","character_count",100,"chunks",List.of(Map.of("id","chunk-1","text","Atomicity commits all changes or rolls them back.","locator","Text, passage 1"))));
        when(agent.generateStudy(any())).thenReturn(Map.of("title","Transaction notes","kind","notes","request","Explain it","mode","local_slm","summary","Changes form one unit.","bullets",List.of("Atomicity means all or nothing."),"sources",List.of(Map.of("id","chunk-1","title","My private notes","locator","Text, passage 1","excerpt","Atomicity commits all changes or rolls them back."))));
    }
    String demo() throws Exception{return mapper.readTree(mvc.perform(post("/api/auth/demo")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("token").asText();}
    String upload() throws Exception {return mapper.readTree(mvc.perform(multipart("/api/documents/import").file(new MockMultipartFile("file","notes.txt","text/plain","Original personal notes".getBytes())).header("Authorization","Bearer "+token)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asText();}
    @Test void ordinaryUsersCanUploadAndGenerateWithoutAdminRole() throws Exception {
        String id=upload();
        mvc.perform(post("/api/documents/"+id+"/generate").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"notes\",\"request\":\"Explain it\"}")).andExpect(status().isCreated()).andExpect(jsonPath("$.summary").value("Changes form one unit."));
        mvc.perform(get("/api/documents/"+id).header("Authorization","Bearer "+token)).andExpect(jsonPath("$.materials.length()").value(1)).andExpect(jsonPath("$.excerpt").value("Atomicity commits all changes or rolls them back."));
    }
    @Test void documentsAndGeneratedNotesAreStrictlyOwnerScoped() throws Exception {
        String id=upload(),other=demo();
        mvc.perform(get("/api/documents").header("Authorization","Bearer "+other)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/documents/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/documents/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(post("/api/documents/"+id+"/generate").header("Authorization","Bearer "+other).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"notes\",\"request\":\"Explain it\"}")).andExpect(status().isNotFound());
        verify(agent,never()).generateStudy(any());
    }
    @Test void invalidRequestsAndUnauthenticatedUploadsAreRejected() throws Exception {
        mvc.perform(get("/api/documents")).andExpect(status().isUnauthorized());
        String id=upload();
        mvc.perform(post("/api/documents/"+id+"/generate").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"questions\",\"request\":\"Explain it\",\"count\":99}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/documents/"+id+"/generate").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"invalid\",\"request\":\"Explain it\"}")).andExpect(status().isBadRequest());
    }
    @Test void deleteRemovesTheDocumentAndMaterials() throws Exception {
        String id=upload();mvc.perform(delete("/api/documents/"+id).header("Authorization","Bearer "+token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/documents/"+id).header("Authorization","Bearer "+token)).andExpect(status().isNotFound());
    }
}
