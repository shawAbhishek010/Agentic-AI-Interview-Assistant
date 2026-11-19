package com.placementai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.DefaultUriBuilderFactory;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;

@Component
class AgentClient {
    private final RestClient client;
    private static final ParameterizedTypeReference<Map<String,Object>> MAP=new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<Map<String,Object>>> LIST=new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<byte[]> BYTES=new ParameterizedTypeReference<>() {};
    AgentClient(@Value("${app.agent-url}") String url,@Value("${app.internal-token}") String token) {
        var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());factory.setReadTimeout(Duration.ofSeconds(45));
        var uris=new DefaultUriBuilderFactory(url);uris.setEncodingMode(DefaultUriBuilderFactory.EncodingMode.NONE);
        client=RestClient.builder().uriBuilderFactory(uris).defaultHeader("X-Internal-Token",token).requestFactory(factory).build();
    }
    private <T> T request(HttpMethod method,String path,Object body,ParameterizedTypeReference<T> type) {
        try {
            var request=client.method(method).uri(path);
            if(body!=null) request.contentType(MediaType.APPLICATION_JSON).body(body);
            return request.retrieve().body(type);
        } catch(RestClientResponseException ex) {
            int status=ex.getStatusCode().value();
            String message="Interview service rejected the request";
            try {var json=new com.fasterxml.jackson.databind.ObjectMapper().readTree(ex.getResponseBodyAsString());if(json.path("detail").isTextual()) message=json.path("detail").asText();}catch(Exception ignored) {}
            throw new ApiException(status>=500?503:status,message.substring(0,Math.min(500,message.length())));
        } catch(RestClientException ex) { throw new ApiException(503,"Interview service is unavailable. Please retry when the agent is running."); }
    }
    Map<String,Object> health() {return request(HttpMethod.GET,"/internal/health",null,MAP);}
    Map<String,Object> catalog() {return request(HttpMethod.GET,"/internal/catalog",null,MAP);}
    Map<String,Object> modelStatus() {return request(HttpMethod.GET,"/internal/model/status",null,MAP);}
    Map<String,Object> modelTest() {return request(HttpMethod.POST,"/internal/model/test",Map.of(),MAP);}
    Map<String,Object> question(String id) {return request(HttpMethod.GET,"/internal/questions/"+safeId(id),null,MAP);}
    List<Map<String,Object>> questions(Map<String,String> filters) {
        var uri=UriComponentsBuilder.fromPath("/internal/questions");
        for(var key:List.of("role","topic","difficulty","search")) if(filters.containsKey(key)&&!filters.get(key).isBlank()) uri.queryParam(key,filters.get(key));
        return request(HttpMethod.GET,uri.build().encode().toUriString(),null,LIST);
    }
    Map<String,Object> plan(Object body) {return request(HttpMethod.POST,"/internal/agent/plan",body,MAP);}
    Map<String,Object> evaluate(String id,String answer) {return request(HttpMethod.POST,"/internal/agent/evaluate",Map.of("question_id",id,"answer",answer),MAP);}
    Map<String,Object> query(Object body) {return request(HttpMethod.POST,"/internal/agent/query",body,MAP);}
    Map<String,Object> chat(Object body) {return request(HttpMethod.POST,"/internal/agent/chat",body,MAP);}
    Map<String,Object> voiceStatus() {return request(HttpMethod.GET,"/internal/voice/status",null,MAP);}
    byte[] speech(Object body) {return request(HttpMethod.POST,"/internal/voice/speech",body,BYTES);}
    Map<String,Object> generateStudy(Object body) {return request(HttpMethod.POST,"/internal/documents/generate",body,MAP);}
    Map<String,Object> extractDocument(MultipartFile file,String title) {return multipart("/internal/documents/extract",file,Map.of("title",title));}
    List<Map<String,Object>> sources() {return request(HttpMethod.GET,"/internal/sources",null,LIST);}
    Map<String,Object> index(String id) {return request(HttpMethod.POST,"/internal/sources/"+safeId(id)+"/index",null,MAP);}
    void deleteSource(String id) {request(HttpMethod.DELETE,"/internal/sources/"+safeId(id),null,MAP);}
    Map<String,Object> importSource(MultipartFile file,String title,String url,String license) {
        return multipart("/internal/sources/import",file,Map.of("title",title,"url",url,"license",license));
    }
    private Map<String,Object> multipart(String path,MultipartFile file,Map<String,String> fields) {
        if(file.getSize()>5_000_000) throw new ApiException(413,"Maximum upload size is 5 MB");
        try {
            var form=new LinkedMultiValueMap<String,Object>();
            form.add("file",new ByteArrayResource(file.getBytes()) {@Override public String getFilename() {return file.getOriginalFilename();}});
            fields.forEach(form::add);
            return client.post().uri(path).contentType(MediaType.MULTIPART_FORM_DATA).body(form).retrieve().body(MAP);
        } catch(RestClientResponseException ex) {String message="The document could not be imported. Check its format and readable text.";try{var detail=new com.fasterxml.jackson.databind.ObjectMapper().readTree(ex.getResponseBodyAsString()).path("detail");if(detail.isTextual())message=detail.asText();}catch(Exception ignored){}throw new ApiException(ex.getStatusCode().value(),message.substring(0,Math.min(400,message.length())));}
        catch(Exception ex) {throw new ApiException(503,"Import service is unavailable or file could not be read");}
    }
    private static String safeId(String id) {if(!id.matches("[A-Za-z0-9_-]{1,200}")) throw new ApiException(400,"Invalid identifier");return id;}
}
