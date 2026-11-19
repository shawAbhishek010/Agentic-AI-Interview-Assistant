package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api/documents")
class StudyDocumentController {
    final StudyDocumentRepository documents;final AgentClient agent;final JsonStore json;
    StudyDocumentController(StudyDocumentRepository documents,AgentClient agent,JsonStore json){this.documents=documents;this.agent=agent;this.json=json;}
    record Generate(@NotBlank @Pattern(regexp="notes|questions") String kind,@NotBlank @Size(min=2,max=2000) String request,@Min(1) @Max(5) Integer count){}
    @GetMapping List<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt){return documents.findByOwnerIdOrderByCreatedAtDesc(jwt.getSubject()).stream().map(d->view(d,false)).toList();}
    @PostMapping("/import") @ResponseStatus(HttpStatus.CREATED) @Transactional
    Map<String,Object> upload(@AuthenticationPrincipal Jwt jwt,@RequestParam MultipartFile file,@RequestParam(defaultValue="") String title){
        if(documents.countByOwnerId(jwt.getSubject())>=20)throw new ApiException(429,"Your workspace allows 20 study documents. Delete one before uploading another.");
        if(title.length()>200)throw new ApiException(400,"Document title must contain at most 200 characters");
        var extracted=agent.extractDocument(file,title);
        if(!(extracted.get("chunks") instanceof List<?> chunks)||chunks.isEmpty())throw new ApiException(502,"Document extraction returned no readable passages");
        var d=new StudyDocument();d.ownerId=jwt.getSubject();d.title=extracted.get("title").toString();d.fileName=extracted.get("file_name").toString();d.characterCount=((Number)extracted.get("character_count")).intValue();d.chunkCount=chunks.size();d.chunksJson=json.write(chunks);
        return view(documents.save(d),true);
    }
    @GetMapping("/{id}") @Transactional Map<String,Object> get(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){return view(owned(id,jwt),true);}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String id){documents.delete(owned(id,jwt));}
    @PostMapping("/{id}/generate") @ResponseStatus(HttpStatus.CREATED) @Transactional
    Map<String,Object> generate(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@Valid @RequestBody Generate body){
        var d=owned(id,jwt);
        var result=agent.generateStudy(Map.of("title",d.title,"chunks",json.rows(d.chunksJson),"kind",body.kind(),"request",body.request().trim(),"count",body.count()==null?5:body.count()));
        if(result==null||!("local_slm".equals(result.get("mode"))||"extractive".equals(result.get("mode"))))throw new ApiException(502,"Study generation returned an invalid result");
        var material=new LinkedHashMap<String,Object>(result);material.put("id",UUID.randomUUID().toString());material.put("created_at",Instant.now().toString());
        var history=json.rows(d.materialsJson);history.add(0,material);if(history.size()>20)history=new ArrayList<>(history.subList(0,20));d.materialsJson=json.write(history);documents.save(d);return material;
    }
    private StudyDocument owned(String id,Jwt jwt){return documents.findByIdAndOwnerId(id,jwt.getSubject()).orElseThrow(()->new ApiException(404,"Document not found"));}
    private Map<String,Object> view(StudyDocument d,boolean detail){
        var result=new LinkedHashMap<String,Object>();result.put("id",d.id);result.put("title",d.title);result.put("file_name",d.fileName);result.put("character_count",d.characterCount);result.put("chunk_count",d.chunkCount);result.put("created_at",d.createdAt.toString());result.put("status","ready");
        if(detail){var chunks=json.rows(d.chunksJson);result.put("excerpt",chunks.isEmpty()?"":chunks.get(0).get("text"));result.put("materials",json.rows(d.materialsJson));}return result;
    }
}
