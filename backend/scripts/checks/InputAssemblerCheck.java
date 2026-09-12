import java.util.*;
public class InputAssemblerCheck {
  public static void main(String[] args) throws Exception {
    Class<?> assembler;
    try { assembler=Class.forName("com.seax.backend.core.AiInputAssembler"); }
    catch(ClassNotFoundException e) { throw new AssertionError("Expanded AI input assembler is not implemented"); }
    var memory=new LinkedHashMap<String,Object>();
    memory.put("version",1); memory.put("departments",List.of()); memory.put("knowledgeItems",List.of());
    memory.put("relationships",List.of()); memory.put("evidence",List.of()); memory.put("projectExperiences",List.of());
    memory.put("relationshipsDescription", "");
    var workflow=new LinkedHashMap<String,Object>();
    workflow.put("id","00000000-0000-4000-8000-000000000001");workflow.put("name","search");workflow.put("description","filter search products");
    workflow.put("departmentId","old"); workflow.put("dependsOnWorkflowIds",List.of("old"));
    var method=assembler.getMethod("classification",Object.class,List.class,Map.class);
    var result=(Map<?,?>) method.invoke(null,"00000000-0000-4000-8000-000000000010",List.of(workflow),memory);
    var clean=(Map<?,?>)((List<?>)result.get("workflows")).getFirst();
    if(!clean.keySet().equals(Set.of("id","name","description")))throw new AssertionError("leaked old assignment or dependencies");
    if(!result.containsKey("memoryContext")||!result.containsKey("retrievalManifest"))throw new AssertionError("snapshot provenance missing");
    if(!workflow.containsKey("departmentId"))throw new AssertionError("mutated source");
    System.out.println("PASS: clean classifier inputs, fixed memory context, source not mutated");
  }
}
