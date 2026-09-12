package com.seax.backend.core;

import com.seax.backend.Json;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Optional demo bootstrap; initialization races resolve through the same one-time database
 * constraint.
 */
@Component
public final class GlobalMemorySeeder implements ApplicationRunner {
    private final CoreService core;
    private final boolean enabled;

    public GlobalMemorySeeder(
            CoreService core, @Value("${seax.seed.enabled:true}") boolean enabled) {
        this.core = core;
        this.enabled = enabled;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!enabled) return;
        try (InputStream in =
                getClass()
                        .getClassLoader()
                        .getResourceAsStream("examples/global-memory-software-company.json")) {
            if (in == null) return;
            @SuppressWarnings("unchecked")
            Map<String, Object> memory =
                    Json.read(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            try {
                core.initializeMemory(memory);
            } catch (ApiException e) {
                if (!"GLOBAL_MEMORY_ALREADY_INITIALIZED".equals(e.code())) throw e;
            }
        }
    }
}
