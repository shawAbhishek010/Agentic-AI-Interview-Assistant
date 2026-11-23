package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/behavioral")
class BehavioralController {
    private final AgentClient agent;

    BehavioralController(AgentClient agent) {
        this.agent = agent;
    }

    record Message(
        @NotBlank @Pattern(regexp = "user|assistant") String role,
        @NotBlank @Size(max = 2200) String content
    ) {}

    record Chat(
        @NotBlank @Size(max = 100) String questionId,
        @NotBlank @Size(max = 1200) String message,
        @Size(max = 6) List<@NotNull @Valid Message> history
    ) {}

    @GetMapping("/questions")
    Map<String,Object> questions() {
        return agent.behavioralQuestions();
    }

    @PostMapping("/chat")
    Map<String,Object> chat(@Valid @RequestBody Chat input) {
        return agent.behavioralChat(Map.of(
            "question_id", input.questionId(), "message", input.message(),
            "history", input.history() == null ? List.of() : input.history()
        ));
    }
}
