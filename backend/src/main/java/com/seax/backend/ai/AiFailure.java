package com.seax.backend.ai;

import java.time.Duration;

public class AiFailure extends RuntimeException {
    private final String code;
    private final boolean retryable;
    private final Duration retryAfter;

    public AiFailure(String code, String message, boolean retryable) {
        this(code, message, retryable, Duration.ZERO);
    }

    public AiFailure(String code, String message, boolean retryable, Duration retryAfter) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.retryAfter = retryAfter;
    }

    public String code() {
        return code;
    }

    public boolean retryable() {
        return retryable;
    }

    public Duration retryAfter() {
        return retryAfter;
    }
}
