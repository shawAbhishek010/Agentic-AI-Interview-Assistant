package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api/interviews")
class InterviewController {
    final InterviewRepository sessions; final AgentClient agent; final JsonStore json;
    InterviewController(InterviewRepository sessions,AgentClient agent,JsonStore json) {this.sessions=sessions;this.agent=agent;this.json=json;}
    record Setup(@NotBlank @Size(min=2,max=100) String role,@Size(max=100) String topic,@Pattern(regexp="beginner|intermediate|advanced") String difficulty,@Size(min=5,max=5) List<@NotBlank @Size(max=200) String> questionIds) {}
    record Answer(@NotBlank @Size(max=200) String questionId,@NotBlank @Size(max=12000) String answer) {}
    record Finish(boolean cancel) {}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    Map<String,Object> create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Setup body) {
        var payload=new HashMap<String,Object>();payload.put("role",body.role());if(body.topic()!=null&&!body.topic().isBlank())payload.put("topic",body.topic());if(body.difficulty()!=null)payload.put("difficulty",body.difficulty());if(body.questionIds()!=null)payload.put("question_ids",body.questionIds());
        var plan=agent.plan(payload);
        Object raw=plan.get("questions");
        if(!(raw instanceof List<?> qs)||qs.size()!=5 || qs.stream().map(q->((Map<?,?>)q).get("id")).distinct().count()!=5) throw new ApiException(502,"Agent did not return exactly five distinct grounded questions");
        var s=new Interview();s.ownerId=jwt.getSubject();s.role=body.role();s.topic=body.topic();s.difficulty=body.difficulty();s.questionsJson=json.write(raw);s.traceJson=json.write(plan.getOrDefault("trace",List.of()));return json.view(sessions.save(s));
    }
    @GetMapping List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt) {return sessions.findByOwnerIdOrderByCreatedAtDesc(jwt.getSubject()).stream().map(json::view).toList();}
    @GetMapping("/{id}") @Transactional
    Map<String,Object> get(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) {return json.view(owned(id,jwt));}
    @PostMapping("/{id}/answers") @Transactional
    Map<String,Object> answer(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@Valid @RequestBody Answer body) {
        var s=owned(id,jwt);if(!s.status.equals("active"))throw new ApiException(409,"This interview is no longer active");
        var questions=json.rows(s.questionsJson);var turns=json.rows(s.turnsJson);
        if(questions.stream().noneMatch(q->q.get("id").equals(body.questionId())))throw new ApiException(400,"Question does not belong to this interview");
        if(turns.stream().anyMatch(t->t.get("question_id").equals(body.questionId())))throw new ApiException(409,"This question has already been answered");
        var next=questions.get(turns.size()).get("id");if(!next.equals(body.questionId()))throw new ApiException(409,"Answer the current question before continuing");
        var evaluation=agent.evaluate(body.questionId(),body.answer().trim());
        turns.add(Map.of("question_id",body.questionId(),"answer",body.answer().trim(),"evaluation",evaluation,"answered_at",Instant.now().toString()));s.turnsJson=json.write(turns);
        return json.view(sessions.save(s));
    }
    @PostMapping("/{id}/finish") @Transactional
    Map<String,Object> finish(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestBody(required=false) Finish body) {
        var s=owned(id,jwt);if(!s.status.equals("active"))return json.view(s);
        boolean cancel=body!=null&&body.cancel();if(!cancel&&json.rows(s.turnsJson).size()!=5)throw new ApiException(409,"Answer all five questions before completing this interview");
        s.status=cancel?"cancelled":"completed";s.finishedAt=Instant.now();return json.view(sessions.save(s));
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) {sessions.delete(owned(id,jwt));}
    private Interview owned(String id,Jwt jwt) {return sessions.findByIdAndOwnerId(id,jwt.getSubject()).orElseThrow(()->new ApiException(404,"Interview not found"));}
}
