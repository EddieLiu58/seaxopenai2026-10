package com.seax.backend.core;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.Consumer;

/** Adds a void callback overload so short write transactions remain readable. */
@Component
final class CoreTransactions extends TransactionTemplate {
    private final TransactionTemplate reads;

    CoreTransactions(PlatformTransactionManager manager) {
        super(manager);
        reads = new TransactionTemplate(manager);
        reads.setIsolationLevel(
                org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
        reads.setReadOnly(true);
    }

    <T> T read(java.util.function.Supplier<T> work) {
        return reads.execute(status -> work.get());
    }

    void execute(Consumer<TransactionStatus> work) {
        super.execute(
                status -> {
                    work.accept(status);
                    return null;
                });
    }
}
