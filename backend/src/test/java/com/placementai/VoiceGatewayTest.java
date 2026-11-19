package com.placementai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"debug=false", "spring.datasource.url=jdbc:h2:mem:voice-gateway-tests;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"})
@AutoConfigureMockMvc
class VoiceGatewayTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean AgentClient agent;
    String token;

    @BeforeEach
    void signIn() throws Exception {
        token = mapper.readTree(mvc.perform(post("/api/auth/demo")).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString()).path("token").asText();
    }

    @Test
    void voiceStatusAndSpeechRequireAuthentication() throws Exception {
        mvc.perform(get("/api/voice/status")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/voice/speech").contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"Hello\"}")).andExpect(status().isUnauthorized());
        verify(agent, never()).voiceStatus();
        verify(agent, never()).speech(any());
    }

    @Test
    void statusAndWaveBytesAreForwardedWithNoCacheAndTrimmedInput() throws Exception {
        when(agent.voiceStatus()).thenReturn(Map.of("provider", "piper", "available", true,
                "voice", "en_US-mike-medium", "local", true));
        mvc.perform(get("/api/voice/status").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.provider").value("piper"))
                .andExpect(jsonPath("$.available").value(true)).andExpect(jsonPath("$.local").value(true));
        byte[] audio = new byte[44];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, audio, 0, 4);
        System.arraycopy("WAVE".getBytes(StandardCharsets.US_ASCII), 0, audio, 8, 4);
        when(agent.speech(any())).thenReturn(audio);
        mvc.perform(post("/api/voice/speech").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"  A spoken reply  \"}"))
                .andExpect(status().isOk()).andExpect(content().contentType("audio/wav"))
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(content().bytes(audio));
        verify(agent).speech(Map.of("text", "A spoken reply"));
    }

    @Test
    void invalidInputAndUnavailableVoiceReturnSafeErrors() throws Exception {
        for (String text : new String[]{" ", "x".repeat(2001)}) {
            mvc.perform(post("/api/voice/speech").header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("text", text))))
                    .andExpect(status().isBadRequest());
        }
        verify(agent, never()).speech(any());
        when(agent.speech(any())).thenThrow(new ApiException(503, "Local voice unavailable"));
        mvc.perform(post("/api/voice/speech").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"Speak this\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.message").value("Local voice unavailable"));
        doReturn(new byte[0]).when(agent).speech(any());
        mvc.perform(post("/api/voice/speech").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"Speak this\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Local voice is unavailable. Typed replies remain available."));
    }
}
