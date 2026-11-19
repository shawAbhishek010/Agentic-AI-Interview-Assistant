package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/voice")
class VoiceController {
    private final AgentClient agent;

    VoiceController(AgentClient agent) { this.agent = agent; }

    record Speech(@NotBlank @Size(max = 2000) String text) {}

    @GetMapping("/status")
    Map<String, Object> status() { return agent.voiceStatus(); }

    @PostMapping("/speech")
    ResponseEntity<byte[]> speech(@Valid @RequestBody Speech body) {
        var audio = agent.speech(Map.of("text", body.text().trim()));
        if (audio == null || audio.length == 0) {
            throw new ApiException(503, "Local voice is unavailable. Typed replies remain available.");
        }
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("audio/wav"))
                .cacheControl(CacheControl.noStore()).contentLength(audio.length).body(audio);
    }
}
