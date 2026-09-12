package com.seax.backend.ai;

import java.time.Duration;
import java.util.Map;

public interface AiClient {
    Map<String, Object> generate(String operation, Map<String, Object> input, Duration timeout);
}
