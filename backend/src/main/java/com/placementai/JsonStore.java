package com.placementai;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
class JsonStore {
    final ObjectMapper mapper;
    JsonStore(ObjectMapper mapper) {this.mapper=mapper;}
    String write(Object value) {try {return mapper.writeValueAsString(value);} catch(Exception ex) {throw new IllegalStateException("Cannot store application data",ex);}}
    List<Map<String,Object>> rows(String json) {try {return mapper.readValue(json,new TypeReference<>(){});} catch(Exception ex) {throw new IllegalStateException("Cannot read stored data",ex);}}
    List<String> strings(String json) {try {return mapper.readValue(json,new TypeReference<>(){});} catch(Exception ex) {throw new IllegalStateException("Cannot read stored identifiers",ex);}}
    Map<String,Object> view(Interview s) {
        var result=new LinkedHashMap<String,Object>();
        result.put("id",s.id);result.put("role",s.role);result.put("topic",s.topic);result.put("difficulty",s.difficulty);result.put("status",s.status);
        result.put("questions",rows(s.questionsJson));result.put("turns",rows(s.turnsJson));result.put("trace",rows(s.traceJson));result.put("chat_messages",rows(s.chatJson==null?"[]":s.chatJson));result.put("mode","demo");result.put("created_at",s.createdAt.toString());result.put("finished_at",s.finishedAt==null?null:s.finishedAt.toString());return result;
    }
    Map<String,Object> view(PracticeSet set) {return Map.of("id",set.id,"name",set.name,"role",set.role,"question_ids",strings(set.questionIdsJson),"created_at",set.createdAt.toString());}
}
