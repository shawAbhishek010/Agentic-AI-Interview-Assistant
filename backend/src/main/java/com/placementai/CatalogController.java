package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;

@RestController @RequestMapping("/api")
class CatalogController {
    final AgentClient agent;
    CatalogController(AgentClient agent) {this.agent=agent;}
    @GetMapping("/health") Map<String,Object> health() {
        try {var upstream=agent.health();var result=new LinkedHashMap<String,Object>();result.put("status","ok");result.put("agent_status","ok");result.put("mode",upstream.getOrDefault("mode","demo"));if(upstream.containsKey("model"))result.put("model",upstream.get("model"));return result;}
        catch(ApiException ex) {return Map.of("status","degraded","agent_status","unavailable","mode","demo");}
    }
    @GetMapping("/catalog") Map<String,Object> catalog() {return agent.catalog();}
    @GetMapping("/model/status") Map<String,Object> modelStatus() {return agent.modelStatus();}
    @PostMapping("/model/test") Map<String,Object> modelTest() {return agent.modelTest();}
    @GetMapping("/questions") List<Map<String,Object>> questions(@RequestParam Map<String,String> filters) {return agent.questions(filters);}
    @GetMapping("/questions/{id}") Map<String,Object> question(@PathVariable String id) {return agent.question(id);}
    @GetMapping({"/sources","/admin/sources"}) List<Map<String,Object>> sources() {return agent.sources();}
    record Query(@NotBlank @Size(min=2,max=2000) String query,@Size(max=100) String role,boolean useModel) {}
    @PostMapping("/knowledge/query") Map<String,Object> query(@Valid @RequestBody Query body) {
        var payload=new HashMap<String,Object>();payload.put("query",body.query());payload.put("use_model",body.useModel());if(body.role()!=null&&!body.role().isBlank())payload.put("role",body.role());return agent.query(payload);
    }
    @PostMapping("/admin/sources/import") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> importSource(@RequestParam MultipartFile file,@RequestParam String title,@RequestParam String url,@RequestParam String license) {return agent.importSource(file,title,url,license);}
    @PostMapping("/admin/sources/{id}/index") Map<String,Object> index(@PathVariable String id) {return agent.index(id);}
    @DeleteMapping("/admin/sources/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteSource(@PathVariable String id) {agent.deleteSource(id);}
}
