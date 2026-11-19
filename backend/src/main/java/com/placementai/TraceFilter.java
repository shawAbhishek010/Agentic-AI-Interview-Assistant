package com.placementai;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.IOException;
import java.util.UUID;
@Component
class TraceFilter extends OncePerRequestFilter {
    private static final Logger log=LoggerFactory.getLogger(TraceFilter.class);
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String trace=UUID.randomUUID().toString();long start=System.nanoTime();response.setHeader("X-Trace-ID",trace);
        try {chain.doFilter(request,response);}finally {log.info("trace_id={} method={} path={} status={} latency_ms={}",trace,request.getMethod(),request.getRequestURI(),response.getStatus(),(System.nanoTime()-start)/1_000_000);}
    }
}
