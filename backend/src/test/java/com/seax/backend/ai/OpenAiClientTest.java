package com.seax.backend.ai;

import static org.assertj.core.api.Assertions.*;

import com.seax.backend.Json;
import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.*;

import java.net.InetSocketAddress;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

class OpenAiClientTest {
    HttpServer server;
    OpenAiClient client;
    AtomicInteger calls = new AtomicInteger();
    AtomicReference<Map<String, Object>> request = new AtomicReference<>();
    int status = 200;
    String response = completed("{\"workflows\":[]}");
    String retryAfter;

    @BeforeEach
    void setup() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/v1/responses",
                exchange -> {
                    calls.incrementAndGet();
                    request.set(
                            Json.read(
                                    new String(
                                            exchange.getRequestBody().readAllBytes(),
                                            java.nio.charset.StandardCharsets.UTF_8)));
                    if (retryAfter != null)
                        exchange.getResponseHeaders().set("Retry-After", retryAfter);
                    byte[] bytes = response.getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(status, bytes.length);
                    exchange.getResponseBody().write(bytes);
                    exchange.close();
                });
        server.start();
        client =
                new OpenAiClient(
                        "test-key",
                        "test-model",
                        "http://127.0.0.1:" + server.getAddress().getPort() + "/v1");
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void usesStrictSchemaAndDecodesMessageAmongReasoningItems() {
        assertThat(client.generate("split", Map.of("content", "退款"), Duration.ofSeconds(2)))
                .containsEntry("workflows", List.of());
        assertThat(request.get())
                .containsEntry("model", "test-model")
                .containsEntry("store", false);
        Map<?, ?> format = (Map<?, ?>) ((Map<?, ?>) request.get().get("text")).get("format");
        assertThat(format.get("type")).isEqualTo("json_schema");
        assertThat(format.get("strict")).isEqualTo(true);
        assertThat(calls).hasValue(1);
    }

    @Test
    void classifierSchemaRequiresBoundedAssignmentReason() {
        response = completed("{\"assignments\":[]}");
        client.generate("classify", Map.of(), Duration.ofSeconds(2));

        Map<?, ?> format = (Map<?, ?>) ((Map<?, ?>) request.get().get("text")).get("format");
        Map<?, ?> schema = (Map<?, ?>) format.get("schema");
        Map<?, ?> assignments = (Map<?, ?>) ((Map<?, ?>) schema.get("properties")).get("assignments");
        Map<?, ?> item = (Map<?, ?>) assignments.get("items");
        Map<String, Object> assignmentReason =
                (Map<String, Object>) ((Map<?, ?>) item.get("properties")).get("assignmentReason");
        assertThat((List<Object>) item.get("required")).contains("assignmentReason");
        assertThat(assignmentReason)
                .containsEntry("type", "string")
                .containsEntry("minLength", 1)
                .containsEntry("maxLength", 2000);
    }

    @Test
    void versionTwoOperationsSendTheirStrictContractsAndPreserveContext() {
        for (String operation : List.of("classify_v2", "feedback_v2")) {
            var input = Map.<String, Object>of(
                    "memoryContext", Map.of("version", 7, "evidence", List.of()),
                    "workflows", List.of());
            response = completed(operation.equals("classify_v2")
                    ? "{\"assignments\":[]}"
                    : "{\"departments\":[],\"knowledgeCandidates\":[],\"relationshipCandidates\":[],\"observations\":[]}");
            client.generate(operation, input, Duration.ofSeconds(2));
            Map<?, ?> format = (Map<?, ?>) ((Map<?, ?>) request.get().get("text")).get("format");
            assertThat(format.get("strict")).isEqualTo(true);
            assertThat(format.get("name")).isEqualTo("seax_" + operation);
            assertThat(format.get("schema")).isEqualTo(PromptSchemas.schema(operation));
            var messages = (List<?>) request.get().get("input");
            assertThat(Json.read((String) ((Map<?, ?>) messages.get(1)).get("content"))).isEqualTo(input);
        }
    }

    @Test
    void rateLimitIsOneCountableAttemptAndRetainsRetryAfter() {
        status = 429;
        retryAfter = "45";
        response = "provider secret";
        assertThatThrownBy(() -> client.generate("split", Map.of(), Duration.ofSeconds(2)))
                .isInstanceOfSatisfying(
                        AiFailure.class,
                        e -> {
                            assertThat(e.code()).isEqualTo("AI_RATE_LIMITED");
                            assertThat(e.retryable()).isTrue();
                            assertThat(e.retryAfter()).isEqualTo(Duration.ofSeconds(45));
                            assertThat(e.getMessage()).doesNotContain("secret");
                        });
        assertThat(calls).hasValue(1);
    }

    @Test
    void acceptsHttpDateRetryAfter() {
        status = 503;
        retryAfter =
                ZonedDateTime.now(ZoneOffset.UTC)
                        .plusSeconds(90)
                        .format(DateTimeFormatter.RFC_1123_DATE_TIME);
        assertThatThrownBy(() -> client.generate("feedback", Map.of(), Duration.ofSeconds(2)))
                .isInstanceOfSatisfying(
                        AiFailure.class,
                        e -> assertThat(e.retryAfter().toSeconds()).isBetween(88L, 90L));
    }

    @Test
    void authenticationFailureIsPermanentAndSanitized() {
        status = 401;
        response = "private-key";
        assertThatThrownBy(() -> client.generate("split", Map.of(), Duration.ofSeconds(2)))
                .isInstanceOfSatisfying(
                        AiFailure.class,
                        e -> {
                            assertThat(e.code()).isEqualTo("AI_AUTH_ERROR");
                            assertThat(e.retryable()).isFalse();
                            assertThat(e.getMessage()).doesNotContain("private-key");
                        });
    }

    @Test
    void incompleteMalformedAndRefusedOutputsAreFailuresNotUnknown() {
        for (String bad :
                List.of(
                        "not json",
                        "{}",
                        completed("[]"),
                        "{\"status\":\"incomplete\",\"output\":[]}",
                        "{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"refusal\",\"refusal\":\"no\"}]}]}")) {
            response = bad;
            assertThatThrownBy(() -> client.generate("classify", Map.of(), Duration.ofSeconds(2)))
                    .isInstanceOfSatisfying(
                            AiFailure.class,
                            e -> {
                                assertThat(e.code()).isEqualTo("AI_INVALID_OUTPUT");
                                assertThat(e.retryable()).isTrue();
                            });
        }
    }

    @Test
    void networkTimeoutIsRetryableAndDoesNotIssueAnotherRequest() throws Exception {
        var release = new java.util.concurrent.CountDownLatch(1);
        server.removeContext("/v1/responses");
        server.createContext(
                "/v1/responses",
                exchange -> {
                    calls.incrementAndGet();
                    try {
                        release.await(2, java.util.concurrent.TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    exchange.close();
                });
        try {
            assertThatThrownBy(() -> client.generate("split", Map.of(), Duration.ofMillis(150)))
                    .isInstanceOfSatisfying(
                            AiFailure.class,
                            e -> {
                                assertThat(e.code()).isEqualTo("AI_TIMEOUT");
                                assertThat(e.retryable()).isTrue();
                            });
            assertThat(calls).hasValue(1);
        } finally {
            release.countDown();
        }
    }

    @Test
    void exhaustedDeadlineDoesNotCallProvider() {
        assertThatThrownBy(() -> client.generate("split", Map.of(), Duration.ZERO))
                .isInstanceOfSatisfying(
                        AiFailure.class, e -> assertThat(e.code()).isEqualTo("AI_TIMEOUT"));
        assertThat(calls).hasValue(0);
    }

    @Test
    void missingConfigurationFailsBeforeNetworkCall() {
        client =
                new OpenAiClient(
                        "", "", "http://127.0.0.1:" + server.getAddress().getPort() + "/v1");
        assertThatThrownBy(() -> client.generate("split", Map.of(), Duration.ofSeconds(2)))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.retryable()).isFalse());
        assertThat(calls).hasValue(0);
    }

    static String completed(String output) {
        return Json.write(
                Map.of(
                        "status",
                        "completed",
                        "output",
                        List.of(
                                Map.of("type", "reasoning", "summary", List.of()),
                                Map.of(
                                        "type",
                                        "message",
                                        "content",
                                        List.of(Map.of("type", "output_text", "text", output))))));
    }
}
