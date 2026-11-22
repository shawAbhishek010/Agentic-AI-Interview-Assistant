package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/coding")
class CodingController {
    private final AgentClient agent;

    CodingController(AgentClient agent) {
        this.agent = agent;
    }

    record Coach(
        @NotBlank @Size(max = 100) String challengeId,
        @NotBlank @Pattern(regexp = "java|javascript|python") String language,
        @NotBlank @Pattern(regexp = "hint|review") String action,
        @Size(max = 12000) String code
    ) {}

    @GetMapping("/challenges")
    Map<String,Object> challenges() {
        return agent.codingChallenges();
    }

    @PostMapping("/coach")
    Map<String,Object> coach(@Valid @RequestBody Coach input) {
        return agent.codingCoach(Map.of(
            "challenge_id", input.challengeId(), "language", input.language(), "action", input.action(),
            "code", input.code() == null ? "" : input.code()
        ));
    }
}
