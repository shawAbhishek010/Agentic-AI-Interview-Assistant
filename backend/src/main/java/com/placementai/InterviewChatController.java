package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/interviews/{id}/chat")
class InterviewChatController {
    private static final int MAX_MESSAGES = 80;
    private static final int HISTORY_MESSAGES = 6;
    private final InterviewRepository sessions;
    private final AgentClient agent;
    private final JsonStore json;

    InterviewChatController(InterviewRepository sessions, AgentClient agent, JsonStore json) {
        this.sessions = sessions;
        this.agent = agent;
        this.json = json;
    }

    record Chat(@NotBlank @Size(max = 2000) String message,
                @Size(min = 1, max = 200) String questionId) {}

    @GetMapping
    @Transactional
    List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
                                  @RequestParam(name = "question_id", required = false) String questionId) {
        var session = owned(id, jwt);
        var messages = messages(session);
        if (questionId == null) return messages;
        question(session, questionId);
        return messages.stream().filter(message -> questionId.equals(message.get("question_id"))).toList();
    }

    @PostMapping
    @Transactional
    Map<String, Object> chat(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
                             @Valid @RequestBody Chat body) {
        var session = owned(id, jwt);
        if ("cancelled".equals(session.status)) {
            throw new ApiException(409, "This interview has ended. Start a new interview to continue chatting.");
        }
        var messages = messages(session);
        if (messages.size() > MAX_MESSAGES - 2) {
            throw new ApiException(429, "This interview has reached its 40 chat exchange limit. Start a new interview to continue.");
        }
        var selected = question(session, body.questionId());
        var questionId = selected.get("id").toString();
        var history = messages.stream()
                .filter(message -> questionId.equals(message.get("question_id")))
                .map(this::historyEntry)
                .toList();
        history = history.subList(Math.max(0, history.size() - HISTORY_MESSAGES), history.size());
        var message = body.message().trim();
        var sentAt = Instant.now();
        var context = new LinkedHashMap<String, Object>();
        context.put("question", selected);
        context.put("message", message);
        context.put("history", history);
        json.rows(session.turnsJson).stream()
                .filter(turn -> questionId.equals(turn.get("question_id")))
                .findFirst().ifPresent(turn -> {
                    if (turn.get("answer") instanceof String candidateAnswer && !candidateAnswer.isBlank()) {
                        context.put("candidate_answer", candidateAnswer);
                    }
                    if (turn.get("evaluation") instanceof Map<?, ?> evaluation
                            && evaluation.get("follow_up") instanceof String followUp && !followUp.isBlank()) {
                        context.put("interviewer_follow_up", followUp.substring(0, Math.min(1000, followUp.length())));
                    }
                });
        var response = agent.chat(context);
        if (response == null) {
            throw new ApiException(502, "Interview service returned an invalid chat reply. Please retry.");
        }
        var answer = response.get("answer");
        var mode = response.get("mode");
        var scope = response.getOrDefault("scope", "interview");
        boolean validScope = "interview".equals(scope)
                || ("general".equals(scope) && "local_slm".equals(mode))
                || ("unavailable".equals(scope) && "demo".equals(mode));
        if (!(answer instanceof String content) || content.isBlank() || content.length() > 3000
                || !("demo".equals(mode) || "local_slm".equals(mode)) || !validScope) {
            throw new ApiException(502, "Interview service returned an invalid chat reply. Please retry.");
        }
        var user = message(questionId, "user", message, "user", sentAt);
        var reply = message(questionId, "assistant", content.trim(), mode.toString(), Instant.now());
        reply.put("scope", scope);
        if ("interview".equals(scope) && selected.get("source") instanceof Map<?, ?> source) {
            reply.put("source", source);
        }
        if (response.get("model") instanceof Map<?, ?> model) reply.put("model", model);
        if (response.get("warning") instanceof String warning && !warning.isBlank()) {
            reply.put("warning", warning.substring(0, Math.min(500, warning.length())));
        }
        messages.add(user);
        messages.add(reply);
        session.chatJson = json.write(messages);
        sessions.save(session);
        return Map.of("messages", messages, "reply", reply);
    }

    private List<Map<String, Object>> messages(Interview session) {
        return json.rows(session.chatJson == null ? "[]" : session.chatJson);
    }

    private Map<String, Object> historyEntry(Map<String, Object> message) {
        var history = new LinkedHashMap<String, Object>();
        history.put("role", message.get("role"));
        history.put("content", message.get("content"));
        var scope = message.get("scope");
        if ("interview".equals(scope) || "general".equals(scope)) history.put("scope", scope);
        return history;
    }

    private Map<String, Object> question(Interview session, String requestedId) {
        var questions = json.rows(session.questionsJson);
        String selectedId = requestedId;
        if (selectedId == null) {
            var answered = new HashSet<Object>();
            json.rows(session.turnsJson).forEach(turn -> answered.add(turn.get("question_id")));
            var current = questions.stream().filter(value -> !answered.contains(value.get("id")))
                    .findFirst().orElse(questions.get(questions.size() - 1));
            selectedId = current.get("id").toString();
        }
        final String target = selectedId;
        return questions.stream().filter(value -> target.equals(value.get("id"))).findFirst()
                .orElseThrow(() -> new ApiException(400, "Question does not belong to this interview"));
    }

    private Map<String, Object> message(String questionId, String role, String content, String mode, Instant createdAt) {
        var value = new LinkedHashMap<String, Object>();
        value.put("id", UUID.randomUUID().toString());
        value.put("question_id", questionId);
        value.put("role", role);
        value.put("content", content);
        value.put("created_at", createdAt.toString());
        value.put("mode", mode);
        return value;
    }

    private Interview owned(String id, Jwt jwt) {
        return sessions.findByIdAndOwnerId(id, jwt.getSubject())
                .orElseThrow(() -> new ApiException(404, "Interview not found"));
    }
}
