package com.placementai;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"debug=false","spring.datasource.url=jdbc:h2:mem:model-gateway-tests;DB_CLOSE_DELAY=-1","spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class ModelGatewayTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean AgentClient agent;
    String token;
    final Map<String,Object> model=Map.of("provider","llama.cpp","model_id","Llama-3.2-3B-Instruct","status","ready","local",true);

    @BeforeEach void signIn() throws Exception {
        token=mapper.readTree(mvc.perform(post("/api/auth/demo")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("token").asText();
    }

    @Test void modelRoutesRequireAuthenticationAndPassThroughActualStatusAndResponse() throws Exception {
        mvc.perform(get("/api/model/status")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/model/test")).andExpect(status().isUnauthorized());
        when(agent.modelStatus()).thenReturn(model);
        mvc.perform(get("/api/model/status").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ready")).andExpect(jsonPath("$.model_id").value("Llama-3.2-3B-Instruct"));
        when(agent.modelTest()).thenReturn(Map.of("mode","local_slm","model",model,"prompt","A fixed test","response","A local response","latency_ms",12,"usage",Map.of("completion_tokens",3)));
        mvc.perform(post("/api/model/test").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("local_slm")).andExpect(jsonPath("$.response").value("A local response"));
        when(agent.modelTest()).thenThrow(new ApiException(503,"Local model is unavailable"));
        mvc.perform(post("/api/model/test").header("Authorization","Bearer "+token)).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.message").value("Local model is unavailable"));
    }

    @Test void knowledgeQueriesDefaultToNoInferenceAndForwardExplicitOptIn() throws Exception {
        when(agent.query(any())).thenReturn(Map.of("answer","Source reference","mode","demo"));
        mvc.perform(post("/api/knowledge/query").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"What is a closure?\"}")).andExpect(status().isOk());
        var payload=ArgumentCaptor.forClass(Map.class);
        verify(agent).query(payload.capture());
        assertEquals(false,payload.getValue().get("use_model"));
        clearInvocations(agent);
        mvc.perform(post("/api/knowledge/query").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"What is a closure?\",\"use_model\":true,\"role\":\"Frontend Developer\"}")).andExpect(status().isOk());
        verify(agent).query(payload.capture());
        assertEquals(true,payload.getValue().get("use_model"));
        assertEquals("Frontend Developer",payload.getValue().get("role"));
    }

    @Test void healthDoesNotLabelModelAvailabilityAsActualInference() throws Exception {
        when(agent.health()).thenReturn(Map.of("status","ok","mode","demo","model",model));
        mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("demo")).andExpect(jsonPath("$.model.status").value("ready"));
    }
}
