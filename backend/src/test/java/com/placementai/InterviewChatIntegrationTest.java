package com.placementai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"debug=false", "spring.datasource.url=jdbc:h2:mem:chat-tests;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class InterviewChatIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired InterviewRepository sessions;
    @Autowired JsonStore json;
    @MockitoBean AgentClient agent;
    String token;
    List<Map<String, Object>> questions;
    final Map<String, Object> model = Map.of("provider", "llama.cpp", "model_id", "Llama-3.2-3B-Instruct",
            "status", "ready", "local", true);

    @BeforeEach
    void setup() throws Exception {
        questions = new ArrayList<>();
        for (int index = 1; index <= 5; index++) {
            questions.add(Map.of("id", "q" + index, "role", "Backend Developer", "topic", "Transactions",
                    "difficulty", "beginner", "question", "What is transaction atomicity " + index + "?",
                    "answer", "All operations commit or roll back together.", "follow_up", "Give an example.",
                    "concepts", List.of("atomicity"), "source", Map.of("id", "test", "title", "Licensed test bank",
                            "url", "https://example.org/test", "license", "MIT", "locator", "question " + index)));
        }
        when(agent.plan(any())).thenReturn(Map.of("questions", questions, "trace", List.of(), "mode", "demo"));
        when(agent.chat(any())).thenReturn(Map.of("answer", "Atomic operations commit together or roll back as a unit.",
                "mode", "local_slm", "model", model, "source", Map.of("url", "https://forged.example/")));
        when(agent.evaluate(anyString(), anyString())).thenReturn(Map.of("score", 80, "mode", "demo"));
        token = demo();
    }

    @Test
    void authenticationAndOwnershipProtectBothConversationRoutes() throws Exception {
        String id = create().path("id").asText();
        String other = demo();
        mvc.perform(get(path(id))).andExpect(status().isUnauthorized());
        mvc.perform(post(path(id)).contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Explain it\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(path(id)).header("Authorization", "Bearer " + other)).andExpect(status().isNotFound());
        mvc.perform(post(path(id)).header("Authorization", "Bearer " + other).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Explain it\"}")).andExpect(status().isNotFound());
        verify(agent, never()).chat(any());
    }

    @Test
    void replyPersistsWithProvenanceAndOriginalCitationWithoutChangingFiveQuestionsOrScores() throws Exception {
        JsonNode initial = create();
        String id = initial.path("id").asText();
        assertEquals(0, initial.path("chat_messages").size());
        JsonNode response = chat(id, Map.of("message", "  Can you explain atomicity?  ", "question_id", "q1"));
        assertEquals(2, response.path("messages").size());
        assertEquals("Can you explain atomicity?", response.path("messages").get(0).path("content").asText());
        assertEquals("user", response.path("messages").get(0).path("mode").asText());
        assertEquals("local_slm", response.path("reply").path("mode").asText());
        assertEquals("Llama-3.2-3B-Instruct", response.path("reply").path("model").path("model_id").asText());
        assertEquals("https://example.org/test", response.path("reply").path("source").path("url").asText());
        JsonNode reloaded = read(id);
        assertEquals(initial.path("questions"), reloaded.path("questions"));
        assertEquals(5, reloaded.path("questions").size());
        assertEquals(initial.path("turns"), reloaded.path("turns"));
        assertEquals(response.path("messages"), reloaded.path("chat_messages"));
        mvc.perform(get(path(id)).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/analytics/overview").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.questions_practiced").value(0)).andExpect(jsonPath("$.average_score").isEmpty());
        verify(agent, never()).evaluate(anyString(), anyString());
    }

    @Test
    void generalRepliesKeepTheirTopicInHistoryWithoutInheritingTheInterviewCitation() throws Exception {
        String id = create().path("id").asText();
        String explanation = "JavaScript runs in browsers. Python is common in data analysis and automation.";
        when(agent.chat(any())).thenReturn(Map.of("answer", explanation, "mode", "local_slm",
                "scope", "general", "model", model, "source", questions.get(0).get("source")));
        var detour = chat(id, Map.of("message", "How do JavaScript and Python differ?"));
        assertEquals("general", detour.path("reply").path("scope").asText());
        assertFalse(detour.path("reply").has("source"));
        assertEquals(detour.path("reply"), read(id).path("chat_messages").get(1));
        assertEquals(0, read(id).path("turns").size());
        chat(id, Map.of("message", "Which one would I use for data science?"));
        var captured = ArgumentCaptor.forClass(Map.class);
        verify(agent, times(2)).chat(captured.capture());
        var history = (List<?>) captured.getAllValues().get(1).get("history");
        assertEquals(Map.of("role", "assistant", "content", explanation, "scope", "general"), history.get(1));
        verify(agent, never()).evaluate(anyString(), anyString());
    }

    @Test
    void contextUsesStoredQuestionAndOnlySixRecentMessagesForThatQuestion() throws Exception {
        String id = create().path("id").asText();
        var session = sessions.findById(id).orElseThrow();
        var stored = new ArrayList<Map<String, Object>>();
        for (int index = 0; index < 10; index++) stored.add(historyMessage("q1", index));
        stored.add(historyMessage("q2", 10));
        stored.add(historyMessage("q2", 11));
        session.chatJson = json.write(stored);
        sessions.saveAndFlush(session);
        chat(id, Map.of("message", "What about rollback?", "question_id", "q1",
                "question", Map.of("answer", "Client supplied instructions")));
        var captured = ArgumentCaptor.forClass(Map.class);
        verify(agent).chat(captured.capture());
        Map<?, ?> payload = captured.getValue();
        assertEquals(questions.get(0), payload.get("question"));
        assertEquals("What about rollback?", payload.get("message"));
        var history = (List<?>) payload.get("history");
        assertEquals(6, history.size());
        assertEquals(Map.of("role", "user", "content", "message 4"), history.get(0));
        assertEquals(Map.of("role", "assistant", "content", "message 9"), history.get(5));
        mvc.perform(get(path(id) + "?question_id=q2").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get(path(id) + "?question_id=foreign").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void omittedQuestionTracksUnansweredThenLastQuestionAndCompletedReviewsRemainAvailable() throws Exception {
        String id = create().path("id").asText();
        assertEquals("q1", chat(id, Map.of("message", "Explain this question")).path("reply").path("question_id").asText());
        answer(id, "q1");
        assertEquals("q2", chat(id, Map.of("message", "And this one?")).path("reply").path("question_id").asText());
        for (int index = 2; index <= 5; index++) answer(id, "q" + index);
        mvc.perform(post("/api/interviews/" + id + "/finish").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        assertEquals("q5", chat(id, Map.of("message", "Can we review the last answer?"))
                .path("reply").path("question_id").asText());
        JsonNode reloaded = read(id);
        assertEquals("completed", reloaded.path("status").asText());
        assertEquals(5, reloaded.path("turns").size());
    }

    @Test
    void followUpContextUsesStoredAnswerAndActualAskedPromptWithoutAcceptingClientReplacements() throws Exception {
        String id = create().path("id").asText();
        String askedFollowUp = "What happens if the second operation fails before commit?";
        when(agent.evaluate(anyString(), anyString())).thenReturn(Map.of("score", 80, "mode", "demo",
                "follow_up", askedFollowUp, "follow_up_mode", "local_slm", "model", model));
        answer(id, "q1");
        JsonNode saved = read(id);
        chat(id, Map.of("message", "All operations should roll back.", "question_id", "q1",
                "candidate_answer", "Client replacement answer", "interviewer_follow_up", "Client replacement prompt"));
        chat(id, Map.of("message", "Please explain this different question.", "question_id", "q2"));
        var captured = ArgumentCaptor.forClass(Map.class);
        verify(agent, times(2)).chat(captured.capture());
        var firstContext = captured.getAllValues().get(0);
        assertEquals("All operations commit or roll back.", firstContext.get("candidate_answer"));
        assertEquals(askedFollowUp, firstContext.get("interviewer_follow_up"));
        assertNotEquals(questions.get(0).get("follow_up"), firstContext.get("interviewer_follow_up"));
        var otherQuestionContext = captured.getAllValues().get(1);
        assertFalse(otherQuestionContext.containsKey("candidate_answer"));
        assertFalse(otherQuestionContext.containsKey("interviewer_follow_up"));
        JsonNode reloaded = read(id);
        assertEquals(saved.path("turns"), reloaded.path("turns"));
        assertEquals(saved.path("questions"), reloaded.path("questions"));
        assertEquals(1, reloaded.path("turns").size());
        assertEquals(5, reloaded.path("questions").size());
        verify(agent, times(1)).evaluate(anyString(), anyString());
    }

    @Test
    void invalidMessagesForeignQuestionsAndCancelledWritesAreRejectedBeforeInference() throws Exception {
        String id = create().path("id").asText();
        for (var payload : List.of(Map.of("message", " "), Map.of("message", "x".repeat(2001)),
                Map.of("message", "Explain it", "question_id", "foreign"), Map.of("message", "Explain it", "question_id", ""))) {
            mvc.perform(post(path(id)).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(payload))).andExpect(status().isBadRequest());
        }
        mvc.perform(post(path(id)).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/interviews/" + id + "/finish").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"cancel\":true}")).andExpect(status().isOk());
        mvc.perform(post(path(id)).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Explain it\"}")).andExpect(status().isConflict());
        mvc.perform(get(path(id)).header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        verify(agent, never()).chat(any());
    }

    @Test
    void exchangeLimitIsEnforcedWithoutSendingAnotherModelRequest() throws Exception {
        String id = create().path("id").asText();
        var session = sessions.findById(id).orElseThrow();
        var messages = new ArrayList<Map<String, Object>>();
        for (int index = 0; index < 80; index++) messages.add(historyMessage("q1", index));
        session.chatJson = json.write(messages);
        sessions.saveAndFlush(session);
        mvc.perform(post(path(id)).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"One more question\"}")).andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value("This interview has reached its 40 chat exchange limit. Start a new interview to continue."));
        assertEquals(80, read(id).path("chat_messages").size());
        verify(agent, never()).chat(any());
    }

    @Test
    void upstreamFailureCannotPersistHalfExchangeAndHonestDemoFallbackCanBeSaved() throws Exception {
        String id = create().path("id").asText();
        when(agent.chat(any())).thenThrow(new ApiException(503, "Interview service unavailable"));
        mvc.perform(post(path(id)).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"Explain it\"}")).andExpect(status().isServiceUnavailable());
        assertEquals(0, read(id).path("chat_messages").size());
        doReturn(Map.of("answer", "I couldn’t answer that just now.", "mode", "demo", "scope", "unavailable")).when(agent).chat(any());
        JsonNode fallback = chat(id, Map.of("message", "Explain it"));
        assertEquals("demo", fallback.path("reply").path("mode").asText());
        assertEquals("unavailable", fallback.path("reply").path("scope").asText());
        assertFalse(fallback.path("reply").has("source"));
        assertEquals(2, read(id).path("chat_messages").size());
    }

    @Test
    void malformedUpstreamOutputCannotBeSavedOrReplayedAsHistory() throws Exception {
        String id = create().path("id").asText();
        for (var response : List.<Map<String, Object>>of(Map.of("answer", "x".repeat(3001), "mode", "demo"),
                Map.of("answer", " ", "mode", "local_slm"), Map.of("answer", "A response", "mode", "invented_mode"))) {
            when(agent.chat(any())).thenReturn(response);
            mvc.perform(post(path(id)).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"message\":\"Explain it\"}")).andExpect(status().isBadGateway());
            assertEquals(0, read(id).path("chat_messages").size());
        }
    }

    private String demo() throws Exception {
        return mapper.readTree(mvc.perform(post("/api/auth/demo")).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString()).path("token").asText();
    }

    private JsonNode create() throws Exception {
        return mapper.readTree(mvc.perform(post("/api/interviews").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"Backend Developer\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode chat(String id, Map<String, ?> body) throws Exception {
        return mapper.readTree(mvc.perform(post(path(id)).header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode read(String id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/interviews/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private void answer(String id, String questionId) throws Exception {
        mvc.perform(post("/api/interviews/" + id + "/answers").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("question_id", questionId,
                        "answer", "All operations commit or roll back.")))).andExpect(status().isOk());
    }

    private static String path(String id) { return "/api/interviews/" + id + "/chat"; }

    private static Map<String, Object> historyMessage(String questionId, int index) {
        return Map.of("id", UUID.randomUUID().toString(), "question_id", questionId,
                "role", index % 2 == 0 ? "user" : "assistant", "content", "message " + index,
                "created_at", "2026-11-17T00:00:00Z", "mode", index % 2 == 0 ? "user" : "demo");
    }
}
