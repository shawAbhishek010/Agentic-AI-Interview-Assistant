package com.placementai;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"debug=false","spring.datasource.url=jdbc:h2:mem:placement-tests;DB_CLOSE_DELAY=-1","spring.jpa.hibernate.ddl-auto=create-drop","app.admin-email=admin@example.org","app.admin-password=only-for-test-bootstrap-12345"})
@AutoConfigureMockMvc
class ApiIntegrationTest {
    @Autowired MockMvc mvc; @Autowired ObjectMapper mapper;
    @MockitoBean AgentClient agent;
    String token;
    List<Map<String,Object>> questions;
    @BeforeEach void setup() throws Exception {
        questions=new ArrayList<>();
        for(int i=1;i<=5;i++)questions.add(Map.of("id","q"+i,"role","Backend Developer","topic","JavaScript","difficulty","beginner","question","What is an atomic transaction "+i+"?","answer","All operations commit or roll back together.","follow_up","Give a practical transaction example.","concepts",List.of("atomicity"),"source",Map.of("id","test","title","Test bank","url","https://example.org","license","MIT","locator","question "+i)));
        when(agent.plan(any())).thenReturn(Map.of("questions",questions,"trace",List.of(Map.of("step","retrieve","status","completed","detail","test","duration_ms",1)),"mode","demo"));
        when(agent.questions(any())).thenReturn(questions);
        when(agent.question(anyString())).thenAnswer(call->questions.stream().filter(q->q.get("id").equals(call.getArgument(0))).findFirst().orElseThrow());
        when(agent.catalog()).thenReturn(Map.of("roles",List.of("Backend Developer"),"topics",List.of("JavaScript"),"question_count",5,"mode","demo"));
        when(agent.evaluate(anyString(),anyString())).thenReturn(Map.of("score",80,"accuracy",80,"completeness",80,"clarity",80,"matched_concepts",List.of("atomicity"),"missing_concepts",List.of(),"feedback",List.of("Demo rubric"),"follow_up","Give an example.","mode","demo","source",questions.get(0).get("source")));
        when(agent.health()).thenReturn(Map.of("status","ok"));when(agent.sources()).thenReturn(List.of());
        token=demo();
    }
    String demo() throws Exception {return mapper.readTree(mvc.perform(post("/api/auth/demo")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("token").asText();}
    JsonNode create(String owner) throws Exception {return mapper.readTree(mvc.perform(post("/api/interviews").header("Authorization","Bearer "+owner).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"Backend Developer\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());}
    @Test void authenticationAndRoleEscalationAreEnforced() throws Exception {
        mvc.perform(get("/api/catalog")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/sources").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        mvc.perform(get("/api/me").header("Authorization","Bearer "+token)).andExpect(jsonPath("$.role").value("USER"));
        mvc.perform(get("/api/me").header("Authorization","Bearer fake.jwt.token")).andExpect(status().isUnauthorized());
    }
    @Test void registrationLoginValidationAndDuplicateEmail() throws Exception {
        String email="student-"+UUID.randomUUID()+"@example.org";
        String body=mapper.writeValueAsString(Map.of("name","Student","email",email,"password","strong-test-password"));
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andExpect(jsonPath("$.user.role").value("USER")).andExpect(jsonPath("$.user.password_hash").doesNotExist());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("email",email,"password","strong-test-password")))).andExpect(status().isOk()).andExpect(jsonPath("$.token").isString());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("email",email,"password","wrong")))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Student\",\"email\":\"invalid\",\"password\":\"short\"}")).andExpect(status().isBadRequest());
    }
    @Test void fiveAnswersPersistCompleteAndDriveActualAnalytics() throws Exception {
        String id=create(token).path("id").asText();
        mvc.perform(post("/api/interviews/"+id+"/finish").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        for(int i=1;i<=5;i++)mvc.perform(post("/api/interviews/"+id+"/answers").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("question_id","q"+i,"answer","An atomic transaction commits or rolls back together.")))).andExpect(status().isOk()).andExpect(jsonPath("$.turns.length()").value(i));
        mvc.perform(post("/api/interviews/"+id+"/finish").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("completed"));
        mvc.perform(get("/api/analytics/overview").header("Authorization","Bearer "+token)).andExpect(jsonPath("$.interviews_completed").value(1)).andExpect(jsonPath("$.questions_practiced").value(5)).andExpect(jsonPath("$.average_score").value(80)).andExpect(jsonPath("$.streak").value(1));
        mvc.perform(get("/api/analytics/topics").header("Authorization","Bearer "+token)).andExpect(jsonPath("$[0].topic").value("JavaScript")).andExpect(jsonPath("$[0].answers").value(5));
    }
    @Test void sessionOwnershipAndAnswerOrderAreProtected() throws Exception {
        String id=create(token).path("id").asText(), other=demo();
        mvc.perform(get("/api/interviews/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/interviews/"+id).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(post("/api/interviews/"+id+"/answers").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"question_id\":\"q2\",\"answer\":\"An answer\"}")).andExpect(status().isConflict());
        mvc.perform(post("/api/interviews/"+id+"/answers").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"question_id\":\"foreign-question\",\"answer\":\"An answer\"}")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/analytics/history").header("Authorization","Bearer "+other)).andExpect(jsonPath("$.length()").value(0));
    }
    @Test void duplicateAnswersAndCancelledSessionsAreProtected() throws Exception {
        String id=create(token).path("id").asText();
        String answer="{\"question_id\":\"q1\",\"answer\":\"An atomic transaction\"}";
        mvc.perform(post("/api/interviews/"+id+"/answers").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(answer)).andExpect(status().isOk());
        mvc.perform(post("/api/interviews/"+id+"/answers").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(answer)).andExpect(status().isConflict());
        mvc.perform(post("/api/interviews/"+id+"/finish").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"cancel\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("cancelled"));
        mvc.perform(post("/api/interviews/"+id+"/answers").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(answer)).andExpect(status().isConflict());
    }
    @Test void practiceSetsBookmarksAndDeletionRemainUserPrivate() throws Exception {
        String other=demo();String setBody=mapper.writeValueAsString(Map.of("name","My practice","role","Backend Developer","question_ids",List.of("q1","q2","q3","q4","q5")));
        JsonNode set=mapper.readTree(mvc.perform(post("/api/practice/sets").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(setBody)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/practice/sets").header("Authorization","Bearer "+other)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete("/api/practice/sets/"+set.path("id").asText()).header("Authorization","Bearer "+other)).andExpect(status().isNotFound());
        mvc.perform(put("/api/bookmarks/q1").header("Authorization","Bearer "+token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/bookmarks").header("Authorization","Bearer "+token)).andExpect(jsonPath("$[0]").value("q1"));
        mvc.perform(get("/api/bookmarks").header("Authorization","Bearer "+other)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete("/api/bookmarks/q1").header("Authorization","Bearer "+token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/bookmarks").header("Authorization","Bearer "+token)).andExpect(jsonPath("$.length()").value(0));
        String id=create(token).path("id").asText();mvc.perform(delete("/api/interviews/"+id).header("Authorization","Bearer "+token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/interviews/"+id).header("Authorization","Bearer "+token)).andExpect(status().isNotFound());
    }
    @Test void insufficientUpstreamQuestionsAndUnavailableAgentAreHonestErrors() throws Exception {
        when(agent.plan(any())).thenReturn(Map.of("questions",questions.subList(0,3)));
        mvc.perform(post("/api/interviews").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"Backend Developer\"}")).andExpect(status().isBadGateway());
        when(agent.catalog()).thenThrow(new ApiException(503,"Interview service unavailable"));
        mvc.perform(get("/api/catalog").header("Authorization","Bearer "+token)).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.message").value("Interview service unavailable"));
    }
    @Test void administratorCanReadProtectedSourceCatalog() throws Exception {
        String body="{\"email\":\"admin@example.org\",\"password\":\"only-for-test-bootstrap-12345\"}";
        String admin=mapper.readTree(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("token").asText();
        mvc.perform(get("/api/admin/sources").header("Authorization","Bearer "+admin)).andExpect(status().isOk());
    }
    @Test void analyticsRejectsInvalidDatesAndEmptyAccountsDoNotInventStats() throws Exception {
        mvc.perform(get("/api/analytics/overview?days=0").header("Authorization","Bearer "+token)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/analytics/overview").header("Authorization","Bearer "+token)).andExpect(jsonPath("$.questions_practiced").value(0)).andExpect(jsonPath("$.average_score").isEmpty()).andExpect(jsonPath("$.score_trend.length()").value(0));
    }
    @Test void bcryptByteLimitAndPublicRoleEscalationAreValidated() throws Exception {
        String body=mapper.writeValueAsString(Map.of("name","Student","email","unicode-"+UUID.randomUUID()+"@example.org","password","界".repeat(30)));
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        String roleBody=mapper.writeValueAsString(Map.of("name","Student","email","role-"+UUID.randomUUID()+"@example.org","password","test-password-long-enough","role","ADMIN"));
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(roleBody)).andExpect(status().isCreated()).andExpect(jsonPath("$.user.role").value("USER"));
    }
}
