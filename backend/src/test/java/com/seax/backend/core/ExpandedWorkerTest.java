package com.seax.backend.core;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.seax.backend.ai.AiClient;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import java.util.*;

class ExpandedWorkerTest {
    @Test void resumedInitialStageUsesCheckpointWithoutCallingSplit() {
        CoreService core=mock(CoreService.class);
        UUID job=UUID.randomUUID(), token=UUID.randomUUID(), workflow=UUID.randomUUID();
        var prepared=Map.<String,Object>of("id",workflow.toString(),"key","a","name","Audit","description","Audit task","dependsOnKeys",List.of());
        var request=Map.<String,Object>of("workflows",List.of(prepared),"memoryContext",Map.of("version",1));
        var input=Map.<String,Object>of("contractVersion",2,"preparedWorkflows",List.of(prepared),"classificationInput",request);
        when(core.claimOne()).thenReturn(Map.of("id",job,"executionToken",token,"type","INITIAL_ANALYSIS"));
        when(core.jobInput(job)).thenReturn(input);
        when(core.heartbeat(job,token)).thenReturn(true);
        AiClient ai=mock(AiClient.class);
        var assignment=new LinkedHashMap<String,Object>();
        assignment.put("workflowId",workflow.toString());assignment.put("assignmentStatus","UNKNOWN");assignment.put("departmentId",null);
        assignment.put("decisionCode","INSUFFICIENT_ORGANIZATION_KNOWLEDGE");assignment.put("explanation","No ownership rule.");
        assignment.put("candidateDepartmentIds",List.of());assignment.put("missingInformation",List.of("Provide ownership."));
        assignment.put("knowledgeItemIds",List.of());assignment.put("evidenceIds",List.of());
        when(ai.generate(eq("classify_v2"),eq(request),any())).thenReturn(Map.of("assignments",List.of(assignment)));
        try(var worker=new DurableJobWorker(core,ai,false,Duration.ofSeconds(2),Duration.ofSeconds(1))) {worker.runOnce();}
        verify(ai,never()).generate(eq("split"),anyMap(),any());
        verify(core).applyInitial(eq(job),eq(token),anyList(),eq(List.of(assignment)));
        verify(core,never()).fail(any(),any(),anyString(),anyString(),anyBoolean(),any());
    }
}
