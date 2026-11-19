package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/api")
class PracticeController {
    final PracticeSetRepository sets; final BookmarkRepository bookmarks; final AgentClient agent; final JsonStore json;
    PracticeController(PracticeSetRepository sets,BookmarkRepository bookmarks,AgentClient agent,JsonStore json) {this.sets=sets;this.bookmarks=bookmarks;this.agent=agent;this.json=json;}
    record NewSet(@NotBlank @Size(max=100) String name,@NotBlank @Size(max=100) String role,@NotNull @Size(min=5,max=5) List<@NotBlank @Size(max=200) String> questionIds) {}
    @GetMapping("/practice/sets") List<Map<String,Object>> sets(@AuthenticationPrincipal Jwt jwt) {return sets.findByOwnerIdOrderByCreatedAtDesc(jwt.getSubject()).stream().map(json::view).toList();}
    @PostMapping("/practice/sets") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody NewSet body) {
        if(new HashSet<>(body.questionIds()).size()!=5) throw new ApiException(400,"Choose five distinct questions");
        var valid=agent.questions(Map.of("role",body.role())).stream().map(q->q.get("id")).toList();
        if(!valid.containsAll(body.questionIds()))throw new ApiException(400,"All questions must match the practice set role");
        var set=new PracticeSet();set.ownerId=jwt.getSubject();set.name=body.name().trim();set.role=body.role();set.questionIdsJson=json.write(body.questionIds());return json.view(sets.save(set));
    }
    @DeleteMapping("/practice/sets/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) {sets.delete(sets.findByIdAndOwnerId(id,jwt.getSubject()).orElseThrow(()->new ApiException(404,"Practice set not found")));}
    @GetMapping("/bookmarks") List<String> bookmarks(@AuthenticationPrincipal Jwt jwt) {return bookmarks.findByOwnerId(jwt.getSubject()).stream().map(b->b.questionId).toList();}
    @PutMapping("/bookmarks/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    void saveBookmark(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) {
        agent.question(id);if(bookmarks.findByOwnerIdAndQuestionId(jwt.getSubject(),id).isPresent())return;
        var b=new Bookmark();b.ownerId=jwt.getSubject();b.questionId=id;bookmarks.save(b);
    }
    @DeleteMapping("/bookmarks/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    void deleteBookmark(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) {bookmarks.findByOwnerIdAndQuestionId(jwt.getSubject(),id).ifPresent(bookmarks::delete);}
}
