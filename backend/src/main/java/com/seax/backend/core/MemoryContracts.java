package com.seax.backend.core;
import java.time.Instant;
import java.util.*;
/** Pure, atomic JSON contract validation. Semantic entailment remains the model/reviewer's job. */
public final class MemoryContracts {
    private MemoryContracts() {
    }
    private static final Set<String> KNOWLEDGE=Set.of("FEATURE","RESPONSIBILITY","CAPABILITY","COMMON_RULE","PROJECT_ARRANGEMENT");
    private static final Set<String> CODES=Set.of("MATCHED_RESPONSIBILITY","INSUFFICIENT_WORKFLOW_DETAIL","CONFLICTING_EVIDENCE","MULTIPLE_PLAUSIBLE_DEPARTMENTS","NO_RESPONSIBLE_DEPARTMENT","INSUFFICIENT_ORGANIZATION_KNOWLEDGE");
    private static void require(boolean b,String message){
        if(!b)throw new IllegalArgumentException(message);
    }
    @SuppressWarnings("unchecked") private static Map<String,Object> map(Object v){
        require(v instanceof Map,"Expected object");
        return (Map<String,Object>)v;
    }
    @SuppressWarnings("unchecked") private static List<Object> list(Object v){
        require(v instanceof List,"Expected non-null array");
        return (List<Object>)v;
    }
    private static List<Map<String,Object>> objects(Object v){
        List<Map<String,Object>> r=new ArrayList<>();
        for(Object x:list(v))r.add(map(x));
        return r;
    }
    private static String text(Object v,int max){
        require(v instanceof String && ((String)v).codePoints().anyMatch(cp -> !Character.isWhitespace(cp) && !Character.isSpaceChar(cp)) && length((String)v)<=max,"Invalid text");
        return (String)v;
    }
    private static int length(String value) { return value.codePointCount(0, value.length()); }
    private static String slice(String value, int start, int end) { return value.substring(value.offsetByCodePoints(0, start), value.offsetByCodePoints(0, end)); }
    private static String id(Object v){
        String s=text(v,36);
        try{
            require(UUID.fromString(s).toString().equalsIgnoreCase(s),"Invalid UUID");
        }
        catch(RuntimeException e){
            throw new IllegalArgumentException("Invalid UUID",e);
        }
        return s;
    }
    private static void fields(Map<String,Object> m,String names){
        Set<String> allowed=Set.of(names.split(" "));
        require(allowed.containsAll(m.keySet()),"Unexpected fields: "+m.keySet());
        require(m.keySet().containsAll(allowed),"Missing fields");
    }
    private static List<Object> strings(Object v,int max){
        List<Object> a=list(v);
        require(a.size()<=max,"Too many items");
        for(Object x:a)text(x,2000);
        require(new HashSet<>(a).size()==a.size(),"Duplicate array values");
        return a;
    }
    private static Map<String,Map<String,Object>> index(Object v){
        Map<String,Map<String,Object>> r=new LinkedHashMap<>();
        for(Map<String,Object> x:objects(v)){
            String i=id(x.get("id"));
            require(r.put(i,x)==null,"Duplicate ID");
        }
        return r;
    }
    private static List<Object> refs(Object v,Map<String,?> index){
        List<Object> a=list(v);
        require(new HashSet<>(a).size()==a.size(),"Duplicate references");
        for(Object x:a){
            id(x);
            require(index.containsKey(x),"Unknown reference "+x);
        }
        return a;
    }
    private static Map<String,Object> m(Object... kv){
        Map<String,Object> r=new LinkedHashMap<>();
        for(int i=0;i<kv.length;i+=2)r.put((String)kv[i],kv[i+1]);
        return r;
    }
    private static Object copy(Object v,boolean freeze){
        if(v instanceof UUID)return v.toString();
        if(v instanceof Map<?,?> raw){
            Map<String,Object> r=new LinkedHashMap<>();
            raw.forEach((k,x)->r.put((String)k,copy(x,freeze)));
            return freeze?Collections.unmodifiableMap(r):r;
        }
        if(v instanceof List<?> a){
            List<Object> r=new ArrayList<>();
            for(Object x:a)r.add(copy(x,freeze));
            return freeze?Collections.unmodifiableList(r):r;
        }
        require(v==null||v instanceof String||v instanceof Number||v instanceof Boolean,"Non-JSON value");
        return v;
    }
    private static Map<String,Object> frozen(Map<String,Object> v){
        return map(copy(v,true));
    }
    private static String uuid(){
        return UUID.randomUUID().toString();
    }
    private static Object pointer(Object root,String path){
        require(path.startsWith("/"),"Invalid JSON pointer");
        Object v=root;
        for(String p:path.substring(1).split("/",-1)){
            p=p.replace("~1","/").replace("~0","~");
            if(v instanceof Map<?,?> a){
                require(a.containsKey(p),"Missing source path");
                v=a.get(p);
            }
            else if(v instanceof List<?> a){
                try{
                    v=a.get(Integer.parseInt(p));
                }
                catch(RuntimeException e){
                    throw new IllegalArgumentException("Invalid source index",e);
                }
            }
            else throw new IllegalArgumentException("Invalid source path");
        }
        return v;
    }
    private static void excerpt(Object root,Object path,Object quote){
        String q=text(quote,2000);
        Object source=pointer(root,text(path,2000));
        require(source instanceof String&&((String)source).contains(q),"Excerpt does not match source");
    }
    private static void scope(Object value,String project){
        Map<String,Object> s=map(value);
        fields(s,"level projectId conditions");
        strings(s.get("conditions"),50);
        String level=text(s.get("level"),30);
        if(level.equals("ORGANIZATION"))require(s.get("projectId")==null,"Organization scope project must be null");
        else{
            require(level.equals("PROJECT"),"Invalid scope");
            id(s.get("projectId"));
            if(project!=null)require(project.equals(s.get("projectId")),"Wrong project scope");
        }
    }
    private static boolean organization(Map<String,Object> x){
        return "ORGANIZATION".equals(map(x.get("scope")).get("level"));
    }
    private static void core(Map<String,Object> x,boolean relation,Map<String,?> departments,String project,boolean initial){
        scope(x.get("scope"),project);
        String type=text(x.get("type"),40);
        if(relation){
            require(Set.of("REPORTS_TO","UPSTREAM_OF","COLLABORATES_WITH").contains(type)&& (initial||!type.equals("REPORTS_TO")),"Invalid relationship type");
            Object from=x.get("fromDepartmentId"),to=x.get("toDepartmentId");
            require(departments.containsKey(from)&&departments.containsKey(to)&&!from.equals(to),"Invalid relationship endpoints");
            if(type.equals("COLLABORATES_WITH"))require(from.toString().compareTo(to.toString())<0,"Collaboration IDs must be sorted");
            text(x.get("description"),10000);
            strings(x.get("exchangedItems"),50);
        }
        else{
            require(KNOWLEDGE.contains(type),"Invalid knowledge type");
            text(x.get("statement"),10000);
            List<Object> ds=refs(x.get("departmentIds"),departments);
            require(type.equals("COMMON_RULE")||!ds.isEmpty(),"Department required");
            require(!type.equals("PROJECT_ARRANGEMENT")||!organization(x),"Arrangement must be project scoped");
        }
    }
    public static Map<String,Object> initialize(Map<String,Object> body){
        body=map(copy(body,false));
        require(Set.of("departments","relationshipsDescription","relationships","knowledgeItems","evidence").containsAll(body.keySet()),"Unexpected initialization field");
        List<Map<String,Object>> ds=objects(body.get("departments"));
        require(!ds.isEmpty()&&ds.size()<=200,"Department count");
        require(body.get("relationshipsDescription") instanceof String&&length(body.get("relationshipsDescription").toString())<=100000,"Relationship background required");
        List<Object> departments=new ArrayList<>(),knowledge=new ArrayList<>(list(body.getOrDefault("knowledgeItems",List.of()))),evidence=new ArrayList<>(list(body.getOrDefault("evidence",List.of()))),relationships=new ArrayList<>(list(body.getOrDefault("relationships",List.of())));
        boolean legacy=!body.containsKey("knowledgeItems")&&!body.containsKey("evidence");
        for(int i=0;i<ds.size();i++){
            Map<String,Object>d=ds.get(i);
            require(Set.of("id","name","description","knowledgeItemIds").containsAll(d.keySet()),"Invalid department fields");
            String did=d.containsKey("id")?id(d.get("id")):uuid();
            text(d.get("name"),200);
            text(d.get("description"),10000);
            departments.add(m("id",did,"name",d.get("name"),"description",d.get("description"),"knowledgeItemIds",List.of()));
            if(legacy){
                List<Object> evidenceIds = new ArrayList<>();
                String description = d.get("description").toString();
                for (int offset = 0; offset < length(description); offset += 2000) {
                    String eid = uuid();
                    evidenceIds.add(eid);
                    evidence.add(m("id",eid,"sourceType","INITIAL_INPUT","sourceProjectId",null,"reportId",null,"reportVersion",null,"workflowId",null,"reportDiffId",null,"sourcePath","/departments/"+i+"/description","excerpt",slice(description, offset, Math.min(offset + 2000, length(description)))));
                }
                knowledge.add(m("id",uuid(),"type","RESPONSIBILITY","statement",description,"departmentIds",List.of(did),"scope",m("level","ORGANIZATION","projectId",null,"conditions",List.of()),"evidenceIds",evidenceIds));
            }
        }
        Map<String,Map<String,Object>> di=index(departments),ei=index(evidence);
        index(knowledge);
        index(relationships);
        for(Map<String,Object> e:objects(evidence)){
            fields(e,"id sourceType sourceProjectId reportId reportVersion workflowId reportDiffId sourcePath excerpt");
            require("INITIAL_INPUT".equals(e.get("sourceType")),"Initialization source only");
            for(String k:List.of("sourceProjectId","reportId","reportVersion","workflowId","reportDiffId"))require(e.get(k)==null,"Forged provenance");
            if(!legacy)excerpt(body,e.get("sourcePath"),e.get("excerpt"));
        }
        for(boolean relation:List.of(false,true))for(Map<String,Object>x:objects(relation?relationships:knowledge)){
            fields(x,relation?"id type fromDepartmentId toDepartmentId description exchangedItems scope evidenceIds":"id type statement departmentIds scope evidenceIds");
            core(x,relation,di,null,true);
            require(organization(x),"Initialization cannot create project facts");
            require(!refs(x.get("evidenceIds"),ei).isEmpty(),"Evidence required");
        }
        Map<String,List<String>> edges=new HashMap<>();
        for(Map<String,Object> r:objects(relationships))if("REPORTS_TO".equals(r.get("type")))edges.computeIfAbsent(r.get("fromDepartmentId").toString(),k->new ArrayList<>()).add(r.get("toDepartmentId").toString());
        for(String d:di.keySet())cycle(d,edges,new HashSet<>(),new HashSet<>());
        rebuild(departments,knowledge);
        return frozen(m("schemaVersion",2,"version",1,"source","INITIAL","sourceProjectId",null,"createdAt",Instant.now().toString(),"departments",departments,"relationshipsDescription",body.get("relationshipsDescription"),"relationships",relationships,"knowledgeItems",knowledge,"projectExperiences",List.of(),"evidence",evidence));
    }
    private static void cycle(String d,Map<String,List<String>> edges,Set<String> active,Set<String> done){
        if(done.contains(d))return;
        require(active.add(d),"REPORTS_TO cycle");
        for(String to:edges.getOrDefault(d,List.of()))cycle(to,edges,active,done);
        active.remove(d);
        done.add(d);
    }
    private static void rebuild(List<Object> departments,List<Object> knowledge){
        for(Object value:departments){
            Map<String,Object>d=map(value);
            List<Object> ids=new ArrayList<>();
            for(Map<String,Object> k:objects(knowledge))if(organization(k)&&list(k.get("departmentIds")).contains(d.get("id")))ids.add(k.get("id"));
            d.put("knowledgeItemIds",ids);
        }
    }
    public static void validateAssignments(List<Map<String,Object>> assignments,List<Map<String,Object>> workflows,Map<String,Object> memory){
        assignments=objects(copy(assignments,false));
        workflows=objects(copy(workflows,false));
        memory=map(copy(memory,false));
        Map<String,Map<String,Object>> wi=index(workflows),di=index(memory.get("departments")),ki=index(memory.get("knowledgeItems")),ei=index(memory.get("evidence"));
        require(assignments.size()==wi.size(),"Assignment count mismatch");
        Set<Object> seen=new HashSet<>();
        for(Map<String,Object>a:assignments){
            fields(a,"workflowId assignmentStatus departmentId decisionCode explanation candidateDepartmentIds missingInformation knowledgeItemIds evidenceIds");
            require(wi.containsKey(a.get("workflowId"))&&seen.add(a.get("workflowId")),"Invalid or duplicate workflow");
            String code=text(a.get("decisionCode"),100);
            require(CODES.contains(code),"Invalid decision code");
            text(a.get("explanation"),2000);
            List<Object> candidates=refs(a.get("candidateDepartmentIds"),di),missing=strings(a.get("missingInformation"),50),ks=refs(a.get("knowledgeItemIds"),ki),es=refs(a.get("evidenceIds"),ei);
            boolean assigned="ASSIGNED".equals(a.get("assignmentStatus"));
            require(assigned||"UNKNOWN".equals(a.get("assignmentStatus")),"Invalid assignment status");
            if(assigned){
                require(code.equals("MATCHED_RESPONSIBILITY")&&di.containsKey(a.get("departmentId"))&&candidates.equals(List.of(a.get("departmentId")))&&missing.isEmpty()&&!es.isEmpty(),"Invalid assigned decision");
                boolean support=false;
                for(Object k:ks){
                    Map<String,Object>x=ki.get(k);
                    if("RESPONSIBILITY".equals(x.get("type"))&&organization(x)&&list(x.get("departmentIds")).contains(a.get("departmentId"))&&list(x.get("evidenceIds")).stream().anyMatch(es::contains))support=true;
                }
                require(support,"Assignment lacks positive organization responsibility reference");
            }
            else{
                require(a.get("departmentId")==null&&!code.equals("MATCHED_RESPONSIBILITY")&&!missing.isEmpty(),"Invalid unknown decision");
                if(code.equals("MULTIPLE_PLAUSIBLE_DEPARTMENTS"))require(candidates.size()>=2,"Need multiple candidates");
                if(code.equals("CONFLICTING_EVIDENCE"))require(es.size()>=2,"Need both sides of conflict");
            }
        }
    }
    public static Map<String,Object> feedback(Map<String,Object> input,Map<String,Object> output){
        input=map(copy(input,false));
        output=map(copy(output,false));
        fields(output,"departments knowledgeCandidates relationshipCandidates observations");
        require(input.get("contractVersion") instanceof Number&&((Number)input.get("contractVersion")).intValue()==2,"Contract version");
        Map<String,Object> project=map(input.get("project")),report=map(input.get("finalReport")),memory=map(copy(input.get("globalMemory"),false));
        String pid=id(project.get("id")),rid=id(report.get("id"));
        require("CLOSED".equals(project.get("status"))&&pid.equals(report.get("projectId")),"Closed project/report required");
        text(project.get("closedAt"),100);
        List<Map<String,Object>> workflows=objects(report.get("workflows")),diffs=objects(input.get("reportDiffs"));
        Map<String,Map<String,Object>> wi=index(workflows),di=index(memory.get("departments")),ki=index(memory.get("knowledgeItems")),ri=index(memory.get("relationships")),ei=index(memory.get("evidence")),sources=index(input.get("sourceDocuments"));
        int version=((Number)report.get("version")).intValue(),next=0;
        Map<String,Map<String,Object>> replay=new LinkedHashMap<>();
        for(Map<String,Object>d:diffs){
            require(pid.equals(d.get("projectId"))&&rid.equals(d.get("reportId")),"Diff wrong report");
            require(((Number)d.get("fromVersion")).intValue()==next&&((Number)d.get("toVersion")).intValue()==next+1,"Incomplete diff history");
            next++;
            for(Map<String,Object> c:objects(d.get("changes"))){
                String wid=id(c.get("workflowId"));
                require(Objects.equals(replay.get(wid),c.get("before")),"Diff before mismatch");
                Object after=c.get("after");
                if(after==null)replay.remove(wid);
                else{
                    Map<String,Object> w=map(after);
                    require(wid.equals(w.get("id")),"Diff workflow mismatch");
                    replay.put(wid,w);
                }
            }
        }
        require(next==version&&replay.equals(wi)&&!diffs.isEmpty()&&"PROJECT_CLOSED".equals(diffs.get(diffs.size()-1).get("eventType")),"Diffs do not reproduce closed report");
        for(Map<String,Object>w:workflows){
            require(rid.equals(w.get("reportId")),"Workflow report mismatch");
            refs(w.get("dependsOnWorkflowIds"),wi);
            String status=text(w.get("assignmentStatus"),20);
            require(Set.of("ASSIGNED","UNKNOWN","UNASSIGNED").contains(status),"Invalid frozen assignment");
            require(status.equals("ASSIGNED")?di.containsKey(w.get("departmentId")):w.get("departmentId")==null,"Invalid frozen department");
        }
        Set<String> covered=new HashSet<>();
        for(Map<String,Object>s:sources.values()){
            fields(s,"id sourceType projectId reportId reportVersion reportDiffId payloadPointer");
            require(pid.equals(s.get("projectId"))&&rid.equals(s.get("reportId")),"Forged document provenance");
            String p=text(s.get("payloadPointer"),2000);
            Map<String,Object> target=map(pointer(input,p));
            if("CLOSED_REPORT".equals(s.get("sourceType"))){
                require(p.equals("/finalReport")&&s.get("reportDiffId")==null&&Objects.equals(s.get("reportVersion"),report.get("version")),"Invalid report document");
            }
            else{
                require("REPORT_DIFF".equals(s.get("sourceType"))&&p.matches("/reportDiffs/[0-9]+")&&Objects.equals(target.get("id"),s.get("reportDiffId"))&&Objects.equals(target.get("toVersion"),s.get("reportVersion")),"Invalid diff document");
            }
            require(covered.add(p),"Duplicate source document");
        }
        require(covered.size()==diffs.size()+1&&covered.contains("/finalReport"),"Incomplete source catalog");
        List<Object> evidence=list(memory.get("evidence")),knowledge=list(memory.get("knowledgeItems")),relationships=list(memory.get("relationships")),experiences=list(memory.get("projectExperiences"));
        for(Map<String,Object>x:objects(experiences))require(!pid.equals(x.get("projectId")),"Project experience already published");
        List<Object> held=new ArrayList<>(),discarded=new ArrayList<>(),addedK=new ArrayList<>(),mergedK=new ArrayList<>(),addedR=new ArrayList<>(),mergedR=new ArrayList<>();
        Map<String,Map<String,Object>> candidates=new LinkedHashMap<>();
        require(list(output.get("knowledgeCandidates")).size()+list(output.get("relationshipCandidates")).size()<=400,"Candidate limit");
        for(boolean relation:List.of(false,true))for(Map<String,Object> c:objects(output.get(relation?"relationshipCandidates":"knowledgeCandidates"))){
            fields(c,relation?"key action existingId disposition rationale evidenceRefs type fromDepartmentId toDepartmentId description exchangedItems scope":"key action existingId disposition rationale evidenceRefs type statement departmentIds scope");
            String key=text(c.get("key"),200),action=text(c.get("action"),30),disposition=text(c.get("disposition"),30);
            require(candidates.put(key,c)==null,"Duplicate candidate key");
            text(c.get("rationale"),2000);
            require(Set.of("PUBLISH","HOLD","DISCARD").contains(disposition),"Invalid disposition");
            core(c,relation,di,pid,false);
            Map<String,Map<String,Object>> existing=relation?ri:ki;
            String[] coreFields=(relation?"type fromDepartmentId toDepartmentId description exchangedItems scope":"type statement departmentIds scope").split(" ");
            Map<String,Object> old=null;
            if(action.equals("ADD"))require(c.get("existingId")==null,"ADD existingId must be null");
            else{
                require(action.equals("MERGE_EVIDENCE"),"Invalid action");
                old=existing.get(c.get("existingId"));
                require(old!=null,"Unknown merge target");
                for(String f:coreFields)require(Objects.equals(old.get(f),c.get(f)),"MERGE_EVIDENCE cannot change "+f);
            }
            List<Object> evidenceIds=resolve(input,c.get("evidenceRefs"),sources,ei,evidence,disposition.equals("PUBLISH"));
            if(!disposition.equals("PUBLISH")){
                (disposition.equals("HOLD")?held:discarded).add(copy(c,false));
                continue;
            }
            require(!evidenceIds.isEmpty(),"Published evidence required");
            // Prevent pure unresolved workflow evidence from becoming confirmed responsibility/arrangement.
            if(!relation&&Set.of("RESPONSIBILITY","PROJECT_ARRANGEMENT").contains(c.get("type"))){
                boolean usable=false;
                for(Object eid:evidenceIds){
                    Map<String,Object> e=ei.get(eid);
                    Object wid=e.get("workflowId");
                    if(wid==null||!wi.containsKey(wid)||"ASSIGNED".equals(wi.get(wid).get("assignmentStatus")))usable=true;
                }
                require(usable,"Unresolved assignment cannot confirm responsibility");
            }
            if(old!=null){
                List<Object> merged=new ArrayList<>(list(old.get("evidenceIds")));
                for(Object eid:evidenceIds)if(!merged.contains(eid))merged.add(eid);
                old.put("evidenceIds",merged);
                List<Object> publication=relation?mergedR:mergedK;
                if(!publication.contains(old.get("id")))publication.add(old.get("id"));
            }
            else{
                Map<String,Object> item=m("id",uuid());
                for(String f:coreFields)item.put(f,copy(c.get(f),false));
                item.put("evidenceIds",evidenceIds);
                (relation?relationships:knowledge).add(item);
                (relation?addedR:addedK).add(item.get("id"));
            }
        }
        List<Object> departments=new ArrayList<>();
        Set<Object> seen=new HashSet<>();
        for(Map<String,Object>d:objects(output.get("departments"))){
            fields(d,"id name description supportingKnowledgeItemIds supportingCandidateKeys");
            Map<String,Object> old=di.get(d.get("id"));
            require(old!=null&&seen.add(d.get("id"))&&Objects.equals(old.get("name"),d.get("name")),"Changed department identity");
            text(d.get("description"),10000);
            List<Object> supports=refs(d.get("supportingKnowledgeItemIds"),ki),keys=strings(d.get("supportingCandidateKeys"),400);
            for(Object kid:supports){
                Map<String,Object> k=ki.get(kid);
                require(organization(k)&&list(k.get("departmentIds")).contains(d.get("id")),"Invalid description support");
            }
            for(Object key:keys){
                Map<String,Object> k=candidates.get(key);
                require(k!=null&&k.containsKey("statement")&&"PUBLISH".equals(k.get("disposition"))&&organization(k)&&list(k.get("departmentIds")).contains(d.get("id")),"Invalid description candidate support");
            }
            if(!Objects.equals(d.get("description"),old.get("description")))require(!supports.isEmpty()||!keys.isEmpty(),"Description change lacks organization support");
            departments.add(m("id",d.get("id"),"name",d.get("name"),"description",d.get("description"),"knowledgeItemIds",List.of()));
        }
        require(seen.size()==di.size(),"Department count mismatch");
        List<Object> observations=list(output.get("observations"));
        require(observations.size()<=200,"Observation limit");
        for(Map<String,Object> o:objects(observations)){
            fields(o,"workflowIds code explanation evidenceRefs");
            refs(o.get("workflowIds"),wi);
            require(Set.of("UNKNOWN_ASSIGNMENT","UNASSIGNED_ASSIGNMENT","UNRESOLVED_CONFLICT","INSUFFICIENT_EVIDENCE","NO_GENERALIZABLE_CHANGE").contains(o.get("code")),"Invalid observation code");
            text(o.get("explanation"),2000);
            resolve(input,o.get("evidenceRefs"),sources,ei,evidence,false);
        }
        List<Object> experienceWorkflows=new ArrayList<>();
        Map<String,Object> reportSource=sources.values().stream().filter(s->"CLOSED_REPORT".equals(s.get("sourceType"))).findFirst().orElseThrow();
        for(int i=0;i<workflows.size();i++){
            Map<String,Object>w=map(copy(workflows.get(i),false));
            String description=text(w.get("description"),10000);
            List<Object> es=resolve(input,List.of(m("kind","DOCUMENT","sourceDocumentId",reportSource.get("id"),"sourcePath","/workflows/"+i+"/description","excerpt",slice(description,0,Math.min(length(description),2000)))),sources,ei,evidence,true);
            w.put("evidenceIds",es);
            experienceWorkflows.add(w);
        }
        experiences.add(m("projectId",pid,"projectName",project.get("name"),"reportId",rid,"reportVersion",report.get("version"),"closedAt",project.get("closedAt"),"experienceMeaning","REPORT_APPROVED","workflows",experienceWorkflows,"reportDiffIds",diffs.stream().map(d->d.get("id")).toList()));
        rebuild(departments,knowledge);
        memory.put("departments",departments);
        memory.put("schemaVersion",2);
        memory.put("version",((Number)memory.get("version")).intValue()+1);
        memory.put("source","FEEDBACK");
        memory.put("sourceProjectId",pid);
        memory.put("createdAt",Instant.now().toString());
        return frozen(m("memory",memory,"publication",m("projectId",pid,"addedKnowledgeItemIds",addedK,"mergedKnowledgeItemIds",mergedK,"addedRelationshipIds",addedR,"mergedRelationshipIds",mergedR),"diagnostics",m("heldCandidates",held,"discardedCandidates",discarded,"observations",observations)));
    }
    private static List<Object> resolve(Map<String,Object> input,Object refs,Map<String,Map<String,Object>> sources,Map<String,Map<String,Object>> existing,List<Object> evidence,boolean publish){
        List<Object> result=new ArrayList<>();
        require(list(refs).size()<=50,"Evidence reference limit");
        for(Map<String,Object> ref:objects(refs)){
            String kind=text(ref.get("kind"),20);
            String eid;
            if(kind.equals("EXISTING")){
                fields(ref,"kind evidenceId");
                eid=id(ref.get("evidenceId"));
                require(existing.containsKey(eid),"Unknown evidence ID");
            }
            else{
                require(kind.equals("DOCUMENT"),"Invalid evidence kind");
                fields(ref,"kind sourceDocumentId sourcePath excerpt");
                Map<String,Object>s=sources.get(ref.get("sourceDocumentId"));
                require(s!=null,"Unknown source document");
                Object root=pointer(input,s.get("payloadPointer").toString());
                excerpt(root,ref.get("sourcePath"),ref.get("excerpt"));
                String path=ref.get("sourcePath").toString();
                Object workflowId=null;
                if(path.matches("/workflows/[0-9]+/.*")){
                    workflowId=map(pointer(root,path.substring(0,path.indexOf('/',11)))).get("id");
                }
                else if(path.matches("/changes/[0-9]+/.*")){
                    String[] parts=path.split("/");
                    workflowId=map(pointer(root,"/changes/"+parts[2])).get("workflowId");
                }
                Map<String,Object> e=m("sourceType",s.get("sourceType"),"sourceProjectId",s.get("projectId"),"reportId",s.get("reportId"),"reportVersion",s.get("reportVersion"),"workflowId",workflowId,"reportDiffId",s.get("reportDiffId"),"sourcePath",path,"excerpt",ref.get("excerpt"));
                eid=null;
                for(Map<String,Object> previous:existing.values()){
                    Map<String,Object> comparable=new LinkedHashMap<>(previous);
                    comparable.remove("id");
                    if(comparable.equals(e)){
                        eid=previous.get("id").toString();
                        break;
                    }
                }
                if(eid==null){
                    eid=uuid();
                    e.put("id",eid);
                    if(publish){
                        evidence.add(e);
                        existing.put(eid,e);
                    }
                }
            }
            if(!result.contains(eid))result.add(eid);
        }
        return result;
    }
}
