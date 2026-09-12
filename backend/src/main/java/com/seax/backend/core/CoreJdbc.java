package com.seax.backend.core;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * PostgreSQL JDBC accepts OffsetDateTime but not Instant; normalize all core bind values centrally.
 */
@Component
final class CoreJdbc {
    private final JdbcTemplate delegate;

    CoreJdbc(JdbcTemplate delegate) {
        this.delegate = delegate;
    }

    int update(String sql, Object... values) {
        if (sql.startsWith("insert into report_diffs values"))
            sql =
                    sql.replace(
                            "values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            "values(?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?)");
        if (sql.startsWith("insert into global_memory values(?,?,?,'FEEDBACK'"))
            sql = sql.replace("values(?,?,?,'FEEDBACK'", "values(?,?::jsonb,?,'FEEDBACK'");
        return delegate.update(sql, normalize(values));
    }

    List<Map<String, Object>> queryForList(String sql, Object... values) {
        return delegate.queryForList(sql, normalize(values)).stream()
                .map(this::normalizeRow)
                .toList();
    }

    <T> List<T> queryForList(String sql, Class<T> type, Object... values) {
        return delegate.queryForList(sql, type, normalize(values));
    }

    <T> T queryForObject(String sql, Class<T> type, Object... values) {
        return delegate.queryForObject(sql, type, normalize(values));
    }

    private Object[] normalize(Object[] values) {
        Object[] copy = values.clone();
        for (int i = 0; i < copy.length; i++)
            if (copy[i] instanceof Instant instant) copy[i] = Timestamp.from(instant);
        return copy;
    }

    private Map<String, Object> normalizeRow(Map<String, Object> row) {
        Map<String, Object> copy = new LinkedHashMap<>();
        row.forEach((key, value) -> copy.put(key, jsonValue(value)));
        return copy;
    }

    private Object jsonValue(Object value) {
        if (value != null && "org.postgresql.util.PGobject".equals(value.getClass().getName()))
            try {
                return value.getClass().getMethod("getValue").invoke(value);
            } catch (ReflectiveOperationException ignored) {
                return String.valueOf(value);
            }
        return value;
    }
}
