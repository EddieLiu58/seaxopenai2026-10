package com.seax.backend;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.util.Map;

public final class Json {
    private static final ObjectMapper MAPPER =
            new ObjectMapper().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    private Json() {}

    public static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalArgumentException("Cannot encode JSON", e);
        }
    }

    public static Map<String, Object> read(String value) {
        try {
            return MAPPER.readValue(value, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid JSON object", e);
        }
    }

    public static <T> T copy(T value) {
        try {
            return MAPPER.readValue(write(value), new TypeReference<T>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("Cannot copy JSON", e);
        }
    }
}
