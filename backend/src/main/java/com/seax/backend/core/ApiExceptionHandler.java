package com.seax.backend.core;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

@RestControllerAdvice
public final class ApiExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> api(ApiException ex) {
        return ResponseEntity.status(ex.status())
                .body(
                        Map.of(
                                "error",
                                Map.of(
                                        "code",
                                        ex.code(),
                                        "message",
                                        ex.getMessage(),
                                        "details",
                                        ex.details())));
    }

    @ExceptionHandler({
        HttpMessageNotReadableException.class,
        MethodArgumentTypeMismatchException.class,
        MissingRequestHeaderException.class,
        MissingServletRequestParameterException.class
    })
    ResponseEntity<Map<String, Object>> invalid(Exception ex) {
        return ResponseEntity.badRequest()
                .body(
                        Map.of(
                                "error",
                                Map.of(
                                        "code",
                                        "INVALID_REQUEST",
                                        "message",
                                        "請求內容無效。",
                                        "details",
                                        Map.of())));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> internal(Exception ex) {
        return ResponseEntity.internalServerError()
                .body(
                        Map.of(
                                "error",
                                Map.of(
                                        "code",
                                        "INTERNAL_ERROR",
                                        "message",
                                        "系統發生未預期錯誤。",
                                        "details",
                                        Map.of())));
    }
}
