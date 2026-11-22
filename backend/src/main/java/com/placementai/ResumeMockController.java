package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/resume-mocks")
class ResumeMockController {
    private static final int QUESTIONS_PER_MOCK = 5;
    private final ResumeMockRepository mocks;
    private final AgentClient agent;
    private final JsonStore json;

    ResumeMockController(ResumeMockRepository mocks, AgentClient agent, JsonStore json) {
        this.mocks = mocks;
        this.agent = agent;
        this.json = json;
    }

    record Answer(
        @NotBlank @Size(max = 100) String questionId,
        @NotBlank @Size(max = 12000) String answer,
        @Size(max = 4000) String followUpAnswer
    ) {}

    @GetMapping
    List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt) {
        return mocks.findByOwnerIdOrderByCreatedAtDesc(jwt.getSubject()).stream()
            .map(mock -> view(mock, false)).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> create(@AuthenticationPrincipal Jwt jwt, @RequestParam MultipartFile file,
                              @RequestParam("target_role") String targetRole) {
        String role = targetRole.strip();
        if (role.length() < 2 || role.length() > 100) {
            throw new ApiException(400, "Enter a target role between 2 and 100 characters.");
        }
        if (mocks.countByOwnerId(jwt.getSubject()) >= 20) {
            throw new ApiException(429, "You can keep up to 20 resume mocks. Delete one to create another.");
        }
        var extracted = agent.extractDocument(file, "Resume");
        if (!(extracted.get("chunks") instanceof List<?> chunks) || chunks.isEmpty()) {
            throw new ApiException(422, "No readable resume passages were found.");
        }
        var plan = agent.resumePlan(Map.of("chunks", chunks, "target_role", role));
        if (plan == null || !(plan.get("questions") instanceof List<?> questions)
                || questions.size() != QUESTIONS_PER_MOCK
                || !("local_slm".equals(plan.get("mode")) || "extractive".equals(plan.get("mode")))) {
            throw new ApiException(502, "Resume retrieval did not return a complete five-question mock.");
        }
        var mock = new ResumeMock();
        mock.ownerId = jwt.getSubject();
        mock.targetRole = role;
        mock.fileName = extracted.get("file_name").toString();
        mock.mode = plan.get("mode").toString();
        mock.questionsJson = json.write(questions);
        return view(mocks.save(mock), true);
    }

    @GetMapping("/{id}")
    Map<String,Object> details(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        return view(mocks.findByIdAndOwnerId(id, jwt.getSubject()).orElseThrow(ResumeMockController::missing), true);
    }

    @PostMapping("/{id}/answers")
    @Transactional
    Map<String,Object> answer(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
                              @Valid @RequestBody Answer input) {
        var mock = mocks.lockOwned(id, jwt.getSubject()).orElseThrow(ResumeMockController::missing);
        var questions = json.rows(mock.questionsJson);
        var turns = json.rows(mock.turnsJson);
        if (turns.size() == questions.size() || !input.questionId().equals(questions.get(turns.size()).get("id"))) {
            throw new ApiException(409, "This answer is no longer current. Reopen the saved mock to continue.");
        }
        turns.add(Map.of(
            "question_id", input.questionId(), "answer", input.answer().strip(),
            "follow_up_answer", input.followUpAnswer() == null ? "" : input.followUpAnswer().strip(),
            "answered_at", Instant.now().toString()
        ));
        mock.turnsJson = json.write(turns);
        return view(mocks.save(mock), true);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        mocks.delete(mocks.lockOwned(id, jwt.getSubject()).orElseThrow(ResumeMockController::missing));
    }

    private static ApiException missing() {
        return new ApiException(404, "Resume mock not found.");
    }

    private Map<String,Object> view(ResumeMock mock, boolean includeContent) {
        var turns = json.rows(mock.turnsJson);
        var result = new LinkedHashMap<String,Object>();
        result.put("id", mock.id);
        result.put("file_name", mock.fileName);
        result.put("target_role", mock.targetRole);
        result.put("created_at", mock.createdAt.toString());
        result.put("mode", mock.mode);
        result.put("answered_count", turns.size());
        if (includeContent) {
            result.put("questions", json.rows(mock.questionsJson));
            result.put("turns", turns);
        }
        return result;
    }
}
