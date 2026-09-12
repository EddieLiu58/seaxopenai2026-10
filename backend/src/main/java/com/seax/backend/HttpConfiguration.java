package com.seax.backend;

import jakarta.servlet.*;
import jakarta.servlet.http.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.config.annotation.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Configuration
public class HttpConfiguration implements WebMvcConfigurer {
    private final String[] origins;

    public HttpConfiguration(@Value("${seax.cors.allowed-origins}") String origins) {
        this.origins =
                Arrays.stream(origins.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toArray(String[]::new);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (origins.length > 0)
            registry.addMapping("/api/v1/**")
                    .allowedOrigins(origins)
                    .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
                    .allowedHeaders("Content-Type", "Idempotency-Key")
                    .maxAge(3600);
    }

    /**
     * Spring's default UUID property editor accepts abbreviated groups; enforce the public format.
     */
    @org.springframework.web.bind.annotation.ControllerAdvice
    public static class UuidBinding {
        @org.springframework.web.bind.annotation.InitBinder
        public void strictUuid(org.springframework.web.bind.WebDataBinder binder) {
            binder.registerCustomEditor(
                    UUID.class,
                    new java.beans.PropertyEditorSupport() {
                        @Override
                        public void setAsText(String value) {
                            if (value == null
                                    || !value.matches(
                                            "[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))
                                throw new IllegalArgumentException("Invalid UUID");
                            setValue(UUID.fromString(value));
                        }
                    });
        }
    }

    @Bean
    OncePerRequestFilter bodyLimitFilter() {
        return new OncePerRequestFilter() {
            private static final int MAX_BYTES = 10 * 1024 * 1024;

            @Override
            protected boolean shouldNotFilter(HttpServletRequest request) {
                return !request.getRequestURI().startsWith("/api/v1/");
            }

            @Override
            protected void doFilterInternal(
                    HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                    throws ServletException, IOException {
                if (request.getContentLengthLong() > MAX_BYTES) {
                    reject(response);
                    return;
                }
                byte[] body = request.getInputStream().readNBytes(MAX_BYTES + 1);
                if (body.length > MAX_BYTES) {
                    reject(response);
                    return;
                }
                chain.doFilter(
                        new HttpServletRequestWrapper(request) {
                            @Override
                            public ServletInputStream getInputStream() {
                                ByteArrayInputStream input = new ByteArrayInputStream(body);
                                return new ServletInputStream() {
                                    @Override
                                    public int read() {
                                        return input.read();
                                    }

                                    @Override
                                    public int read(byte[] b, int off, int len) {
                                        return input.read(b, off, len);
                                    }

                                    @Override
                                    public boolean isFinished() {
                                        return input.available() == 0;
                                    }

                                    @Override
                                    public boolean isReady() {
                                        return true;
                                    }

                                    @Override
                                    public void setReadListener(ReadListener listener) {
                                        throw new UnsupportedOperationException(
                                                "Synchronous JSON requests only");
                                    }
                                };
                            }

                            @Override
                            public BufferedReader getReader() {
                                return new BufferedReader(
                                        new InputStreamReader(
                                                getInputStream(), StandardCharsets.UTF_8));
                            }
                        },
                        response);
            }

            private void reject(HttpServletResponse response) throws IOException {
                response.setStatus(413);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter()
                        .write(
                                Json.write(
                                        Map.of(
                                                "error",
                                                Map.of(
                                                        "code",
                                                        "PAYLOAD_TOO_LARGE",
                                                        "message",
                                                        "請求 body 不可超過 10 MiB。",
                                                        "details",
                                                        Map.of()))));
            }
        };
    }
}
