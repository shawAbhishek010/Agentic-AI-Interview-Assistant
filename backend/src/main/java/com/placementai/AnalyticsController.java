package com.placementai;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;

@RestController @RequestMapping("/api/analytics")
class AnalyticsController {
    final InterviewRepository sessions; final JsonStore json;
    AnalyticsController(InterviewRepository sessions,JsonStore json) {this.sessions=sessions;this.json=json;}
    private List<Interview> range(String owner,int days) {
        if(days<1||days>365)throw new ApiException(400,"Date range must be between 1 and 365 days");
        var cutoff=Instant.now().minus(Duration.ofDays(days));
        return sessions.findByOwnerIdOrderByCreatedAtDesc(owner).stream().filter(s->s.createdAt.isAfter(cutoff)).toList();
    }
    @GetMapping("/overview") Map<String,Object> overview(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="30") int days) {
        var rows=range(jwt.getSubject(),days);var topicScores=new HashMap<String,List<Integer>>();var dayScores=new TreeMap<String,List<Integer>>();var allScores=new ArrayList<Integer>();var activeDays=new HashSet<LocalDate>();
        for(var s:rows) {
            var questions=json.rows(s.questionsJson).stream().collect(Collectors.toMap(q->q.get("id").toString(),q->q.get("topic").toString()));
            for(var turn:json.rows(s.turnsJson)) {
                int score=score(turn);allScores.add(score);
                String topic=questions.getOrDefault(turn.get("question_id").toString(),"General");topicScores.computeIfAbsent(topic,k->new ArrayList<>()).add(score);
                LocalDate day=Instant.parse(turn.get("answered_at").toString()).atZone(ZoneOffset.UTC).toLocalDate();activeDays.add(day);dayScores.computeIfAbsent(day.toString(),k->new ArrayList<>()).add(score);
            }
        }
        int streak=0;var cursor=LocalDate.now(ZoneOffset.UTC);if(!activeDays.contains(cursor))cursor=cursor.minusDays(1);while(activeDays.contains(cursor)){streak++;cursor=cursor.minusDays(1);}
        var recommendations=topicScores.entrySet().stream().sorted(Comparator.comparingDouble(e->average(e.getValue()))).limit(3).map(e->"Practice "+e.getKey()+" and review the cited concepts.").toList();
        if(recommendations.isEmpty())recommendations=List.of("Start a five-question interview to build your study plan.");
        var result=new LinkedHashMap<String,Object>();result.put("interviews_completed",rows.stream().filter(s->s.status.equals("completed")).count());result.put("questions_practiced",allScores.size());result.put("average_score",allScores.isEmpty()?null:Math.round(average(allScores)));result.put("streak",streak);result.put("topics_covered",topicScores.size());
        result.put("score_trend",dayScores.entrySet().stream().map(e->Map.of("date",e.getKey(),"score",Math.round(average(e.getValue())))).toList());result.put("recent_interviews",rows.stream().limit(5).map(json::view).toList());result.put("recommendations",recommendations);return result;
    }
    @GetMapping("/topics") List<Map<String,Object>> topics(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="30") int days) {
        var scores=new TreeMap<String,List<Integer>>();
        for(var s:range(jwt.getSubject(),days)) {
            var qtopics=json.rows(s.questionsJson).stream().collect(Collectors.toMap(q->q.get("id").toString(),q->q.get("topic").toString()));
            for(var turn:json.rows(s.turnsJson))scores.computeIfAbsent(qtopics.getOrDefault(turn.get("question_id").toString(),"General"),k->new ArrayList<>()).add(score(turn));
        }
        return scores.entrySet().stream().map(e->{Map<String,Object> m=new LinkedHashMap<>();m.put("topic",e.getKey());m.put("score",Math.round(average(e.getValue())));m.put("answers",e.getValue().size());return m;}).toList();
    }
    @GetMapping("/history") List<Map<String,Object>> history(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="30") int days) {return range(jwt.getSubject(),days).stream().map(json::view).toList();}
    private int score(Map<String,Object> turn) {return ((Number)((Map<?,?>)turn.get("evaluation")).get("score")).intValue();}
    private double average(List<Integer> list) {return list.stream().mapToInt(Integer::intValue).average().orElse(0);}
}
