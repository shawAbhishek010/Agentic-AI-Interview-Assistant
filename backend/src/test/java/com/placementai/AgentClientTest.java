package com.placementai;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
class AgentClientTest {
    @Test void roleAndSearchAreEncodedExactlyOnceAndInternalTokenIsSent() throws Exception {
        var captured=new AtomicReference<String>();var token=new AtomicReference<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/internal/questions",exchange->{captured.set(exchange.getRequestURI().getRawQuery());token.set(exchange.getRequestHeaders().getFirst("X-Internal-Token"));byte[] body="[]".getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);exchange.close();});server.start();
        try {
            var client=new AgentClient("http://127.0.0.1:"+server.getAddress().getPort(),"private-test-key");
            assertTrue(client.questions(Map.of("role","React Developer","search","{closure} & scope")).isEmpty());
            String decoded=URLDecoder.decode(captured.get(),StandardCharsets.UTF_8);
            assertTrue(decoded.contains("role=React Developer"));assertTrue(decoded.contains("search={closure} & scope"));assertEquals("private-test-key",token.get());
        }finally{server.stop(0);}
    }
}
