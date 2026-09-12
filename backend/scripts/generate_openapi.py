"""Generate the published OpenAPI contract. Run from backend; no dependencies."""
import json
from pathlib import Path

def obj(props, required=None):
    return dict(type='object', properties=props, required=list(props) if required is None else required, additionalProperties=False)
def ref(name): return {'$ref': '#/components/schemas/' + name}
def arr(item, **kw): return dict(type='array', items=item, **kw)
def text(maximum=None, minimum=1, **kw):
    return dict(type='string', minLength=minimum, **({'maxLength': maximum} if maximum else {}), **kw)
def enum(*values): return dict(type='string', enum=list(values))
def nullable(schema): return {'anyOf':[schema, {'type':'null'}]}
uuid = dict(type='string', format='uuid')
time = dict(type='string', format='date-time')
version = dict(type='integer', minimum=0)
positive = dict(type='integer', minimum=1)
name = text(200)
reason = nullable(text(2000))
assignment_reason = nullable(text(2000))
status = enum('UNASSIGNED','ASSIGNED','UNKNOWN')
dependencies = arr(uuid, maxItems=199, uniqueItems=True)
s = {}
s['Department'] = obj(dict(id=uuid, name=name, description=text(10000)))
s['InitializeMemory'] = obj(dict(departments=arr(ref('Department'),minItems=1,maxItems=200), relationshipsDescription=text(100000,0)))
s['GlobalMemory'] = obj(dict(version=positive, **s['InitializeMemory']['properties'], source=enum('INITIAL','FEEDBACK'), sourceProjectId=nullable(uuid), createdAt=time))
s['Project'] = obj(dict(id=uuid,name=name,status=enum('OPEN','CLOSED'),createdAt=time,closedAt=nullable(time)))
s['UserDoc'] = obj(dict(projectId=uuid,content=text(100000),createdAt=time))
s['Workflow'] = obj(dict(id=uuid,reportId=uuid,name=name,description=text(10000),dependsOnWorkflowIds=dependencies,assignmentStatus=status,departmentId=nullable(uuid),assignmentSource=nullable(enum('AI','USER')),assignmentReason=assignment_reason,createdAt=time,updatedAt=time))
s['Report'] = obj(dict(id=uuid,projectId=uuid,version=version,createdAt=time,updatedAt=time,workflows=arr(ref('Workflow'),maxItems=200)))
s['JobError'] = obj(dict(code=enum('AI_TIMEOUT','AI_UNAVAILABLE','AI_RATE_LIMITED','AI_INVALID_OUTPUT','AI_AUTH_ERROR','AI_REQUEST_REJECTED','MEMORY_VERSION_CONFLICT','WORKER_INTERRUPTED','INTERNAL_ERROR'),message=text(),retryable={'type':'boolean'}))
s['Job'] = obj(dict(id=uuid,projectId=uuid,type=enum('INITIAL_ANALYSIS','ALL_REANALYZE','UNASSIGNED_ANALYZE','FEEDBACK'),status=enum('QUEUED','RUNNING','RETRY_WAIT','SUCCEEDED','FAILED'),attempts=dict(type='integer',minimum=0,maximum=3),maxAttempts=dict(type='integer',const=3),nextRetryAt=nullable(time),globalMemoryVersion=positive,inputReportVersion=version,error=nullable(ref('JobError')),createdAt=time,startedAt=nullable(time),finishedAt=nullable(time),result={'oneOf':[{'type':'null'},obj(dict(reportVersion=version)),obj(dict(globalMemoryVersion=positive))]}))
s['Change'] = obj(dict(workflowId=uuid,operation=enum('CREATE','UPDATE','DELETE'),changedFields=arr(enum(*s['Workflow']['properties'])),before=nullable(ref('Workflow')),after=nullable(ref('Workflow'))))
s['ReportDiff'] = obj(dict(id=uuid,projectId=uuid,reportId=uuid,eventType=enum('INITIAL_ANALYSIS','WORKFLOW_CREATED','WORKFLOW_UPDATED','WORKFLOW_DELETED','ALL_REANALYZE','UNASSIGNED_ANALYZE','PROJECT_CLOSED'),phase=enum('CLEAR','APPLY'),source=enum('USER','AI','SYSTEM'),actorId={'type':'null'},reason=reason,jobId=nullable(uuid),globalMemoryVersion=nullable(positive),fromVersion=version,toVersion=positive,changes=arr(ref('Change')),createdAt=time))
s['Error'] = obj(dict(error=obj(dict(code=text(),message=text(),details=dict(type='object',additionalProperties=True)))))
s['CreateProject'] = obj(dict(name=name,userDoc=obj(dict(content=text(100000)))))
s['CreateProjectResult'] = obj(dict(project=ref('Project'),report=ref('Report'),job=ref('Job')))
s['ProjectDetails'] = obj(dict(project=ref('Project'),userDoc=ref('UserDoc'),reportVersion=version,activeAnalysisJobId=nullable(uuid),feedbackJobId=nullable(uuid)))
writefields = dict(name=name,description=text(10000),dependsOnWorkflowIds=dependencies,assignmentStatus=status,departmentId=nullable(uuid),expectedReportVersion=version,reason=text(2000))
s['CreateWorkflow'] = obj(writefields,['name','description','expectedReportVersion'])
s['PatchWorkflow'] = obj(writefields,['expectedReportVersion'])
s['PatchWorkflow']['anyOf'] = [{'required':[field]} for field in ['name','description','dependsOnWorkflowIds','assignmentStatus','departmentId']]
s['WorkflowResult'] = obj(dict(workflow=ref('Workflow'),reportVersion=version))
s['DeleteWorkflowResult'] = obj(dict(deletedWorkflowId=uuid,reportVersion=version))
s['AnalysisRequest'] = {'oneOf':[
    obj(dict(type=dict(type='string',const='ALL_REANALYZE'),expectedReportVersion=version,reason=text(2000))),
    obj(dict(type=dict(type='string',const='UNASSIGNED_ANALYZE'),expectedReportVersion=version,reason=text(2000)),['type','expectedReportVersion'])]}
s['AnalysisResult'] = obj(dict(job=ref('Job'),reportVersion=version))
s['CloseRequest'] = obj(dict(expectedReportVersion=version,reason=text(2000)),['expectedReportVersion'])
s['CloseResult'] = obj(dict(project=ref('Project'),reportVersion=version,feedbackJob=ref('Job')))
s['RetryRequest'] = obj({})
s['RetryResult'] = obj(dict(job=ref('Job')))
for item in ['Project','ReportDiff']:
    s[item+'Page'] = obj(dict(items=arr(ref(item)),total=version,limit=dict(type='integer',minimum=1,maximum=200),offset=version))
# Version 2 permanent memory and reviewable AI decisions.
ids = arr(uuid, uniqueItems=True)
s['Department'] = obj(dict(id=uuid, name=name, description=text(10000), knowledgeItemIds=ids))
s['InitializeDepartment'] = obj(dict(id=uuid, name=name, description=text(10000)), ['name','description'])
s['Scope'] = {'oneOf':[
    obj(dict(level=dict(type='string',const='ORGANIZATION'), projectId={'type':'null'}, conditions=arr(text(2000),maxItems=50))),
    obj(dict(level=dict(type='string',const='PROJECT'), projectId=uuid, conditions=arr(text(2000),maxItems=50)))]}
knowledge_type = enum('FEATURE','RESPONSIBILITY','CAPABILITY','COMMON_RULE','PROJECT_ARRANGEMENT')
knowledge_fields = dict(type=knowledge_type, statement=text(10000), departmentIds=ids, scope=ref('Scope'))
relationship_fields = dict(type=enum('REPORTS_TO','UPSTREAM_OF','COLLABORATES_WITH'), fromDepartmentId=uuid, toDepartmentId=uuid, description=text(10000), exchangedItems=arr(text(2000),maxItems=50), scope=ref('Scope'))
s['KnowledgeItem'] = obj(dict(id=uuid, **knowledge_fields, evidenceIds=arr(uuid,minItems=1,uniqueItems=True)))
s['DepartmentRelationship'] = obj(dict(id=uuid, **relationship_fields, evidenceIds=arr(uuid,minItems=1,uniqueItems=True)))
s['Evidence'] = obj(dict(id=uuid,sourceType=enum('INITIAL_INPUT','CLOSED_REPORT','REPORT_DIFF'),sourceProjectId=nullable(uuid),reportId=nullable(uuid),reportVersion=nullable(version),workflowId=nullable(uuid),reportDiffId=nullable(uuid),sourcePath=text(minimum=0),excerpt=text(2000)))
s['InitializeMemory'] = obj(dict(departments=arr(ref('InitializeDepartment'),minItems=1,maxItems=200),relationshipsDescription=text(100000,0),relationships=arr(ref('DepartmentRelationship')),knowledgeItems=arr(ref('KnowledgeItem')),evidence=arr(ref('Evidence'))),['departments','relationshipsDescription'])
s['InitializeMemory']['description'] = 'Initialization accepts only ORGANIZATION knowledge and INITIAL_INPUT evidence whose pointers resolve in this immutable payload. Missing optional arrays default to empty. Omitted knowledge/evidence are derived from legacy department descriptions; project experiences cannot be supplied.'
s['MemoryCounts'] = obj(dict(relationships=version,knowledgeItems=version,projectExperiences=version,evidence=version))
memory_metadata = dict(schemaVersion=dict(type='integer',const=2),version=positive,source=enum('INITIAL','FEEDBACK'),sourceProjectId=nullable(uuid),createdAt=time,departments=arr(ref('Department')),relationshipsDescription=text(100000,0))
s['GlobalMemory'] = obj(dict(**memory_metadata,counts=ref('MemoryCounts')))
s['WorkflowExperience'] = obj(dict(**s['Workflow']['properties'],evidenceIds=ids))
experience_metadata = dict(projectId=uuid,projectName=name,reportId=uuid,reportVersion=version,closedAt=time,experienceMeaning=dict(type='string',const='REPORT_APPROVED'))
s['ProjectExperience'] = obj(dict(**experience_metadata,workflows=arr(ref('WorkflowExperience'),maxItems=200),reportDiffIds=ids))
s['ExperienceSummary'] = obj(dict(**experience_metadata,workflowCount=version,departmentIds=ids))
s['ExperienceResult'] = obj(dict(version=positive,experience=ref('ProjectExperience')))
s['GlobalMemorySnapshot'] = obj(dict(**memory_metadata,relationships=arr(ref('DepartmentRelationship')),knowledgeItems=arr(ref('KnowledgeItem')),projectExperiences=arr(ref('ProjectExperience')),evidence=arr(ref('Evidence'))))
s['MemoryContext'] = obj(dict(version=positive,departments=arr(ref('Department')),knowledgeItems=arr(ref('KnowledgeItem')),relationships=arr(ref('DepartmentRelationship')),relationshipsDescription=text(100000,0),projectExperiences=arr(ref('ProjectExperience')),evidence=arr(ref('Evidence'))))
s['AssignmentInput'] = obj(dict(projectId=uuid,workflows=arr(obj(dict(id=uuid,name=name,description=text(10000))),maxItems=200),memoryContext=ref('MemoryContext')),['workflows','memoryContext'])
s['SourceDocument'] = obj(dict(id=uuid,sourceType=enum('CLOSED_REPORT','REPORT_DIFF'),projectId=uuid,reportId=uuid,reportVersion=version,reportDiffId=nullable(uuid),payloadPointer=text()))
s['FeedbackInput'] = obj(dict(contractVersion=dict(type='integer',const=2),project=ref('Project'),finalReport=ref('Report'),reportDiffs=arr(ref('ReportDiff')),globalMemory=ref('GlobalMemorySnapshot'),sourceDocuments=arr(ref('SourceDocument'))))
decision_codes = enum('MATCHED_RESPONSIBILITY','INSUFFICIENT_WORKFLOW_DETAIL','CONFLICTING_EVIDENCE','MULTIPLE_PLAUSIBLE_DEPARTMENTS','NO_RESPONSIBLE_DEPARTMENT','INSUFFICIENT_ORGANIZATION_KNOWLEDGE')
s['AssignmentDecision'] = obj(dict(workflowId=uuid,assignmentStatus=enum('ASSIGNED','UNKNOWN'),departmentId=nullable(uuid),decisionCode=decision_codes,explanation=text(2000),candidateDepartmentIds=ids,missingInformation=arr(text(2000)),knowledgeItemIds=ids,evidenceIds=ids))
s['AssignmentDecision']['description'] = 'ASSIGNED requires MATCHED_RESPONSIBILITY, a unique existing department, only that candidate, empty missingInformation and positive responsibility evidence. UNKNOWN requires null departmentId, an UNKNOWN reason and actionable missingInformation. Multiple candidates require at least two department IDs; conflicting evidence cites both sides. All references belong to the fixed actual input.'
s['AssignmentOutput'] = obj(dict(assignments=arr(ref('AssignmentDecision'),maxItems=200)))
s['AnalysisRecord'] = obj(dict(analysisId=uuid,jobId=uuid,reportVersion=version,globalMemoryVersion=positive,results=arr(ref('AssignmentDecision'))))
s['AnalysisRecordPage'] = obj(dict(items=arr(ref('AnalysisRecord')),total=version,limit=dict(type='integer',minimum=1,maximum=200),offset=version))
s['JobError']['properties']['code']['enum'].append('AI_INPUT_TOO_LARGE')
s['Job']['properties']['result'] = {'oneOf':[{'type':'null'},obj(dict(reportVersion=version,analysisId=uuid),['reportVersion']),obj(dict(globalMemoryVersion=positive))]}
s['ExistingEvidenceRef'] = obj(dict(kind=dict(type='string',const='EXISTING'),evidenceId=uuid))
s['DocumentEvidenceRef'] = obj(dict(kind=dict(type='string',const='DOCUMENT'),sourceDocumentId=uuid,sourcePath=text(minimum=0),excerpt=text(2000)))
s['EvidenceRef'] = {'oneOf':[ref('ExistingEvidenceRef'),ref('DocumentEvidenceRef')], 'discriminator':{'propertyName':'kind','mapping':{'EXISTING':'#/components/schemas/ExistingEvidenceRef','DOCUMENT':'#/components/schemas/DocumentEvidenceRef'}}}
candidate_fields = dict(key=text(200),action=enum('ADD','MERGE_EVIDENCE'),existingId=nullable(uuid),disposition=enum('PUBLISH','HOLD','DISCARD'),rationale=text(2000),evidenceRefs=arr(ref('EvidenceRef'),maxItems=50))
s['KnowledgeCandidate'] = obj(dict(**candidate_fields,**knowledge_fields))
s['RelationshipCandidate'] = obj(dict(**candidate_fields,**{**relationship_fields,'type':enum('UPSTREAM_OF','COLLABORATES_WITH')}))
s['FeedbackObservation'] = obj(dict(workflowIds=ids,code=enum('UNKNOWN_ASSIGNMENT','UNASSIGNED_ASSIGNMENT','UNRESOLVED_CONFLICT','INSUFFICIENT_EVIDENCE','NO_GENERALIZABLE_CHANGE'),explanation=text(2000),evidenceRefs=arr(ref('EvidenceRef'),maxItems=50)))
s['FeedbackDepartment'] = obj(dict(id=uuid,name=name,description=text(10000),supportingKnowledgeItemIds=ids,supportingCandidateKeys=arr(text(200),uniqueItems=True)))
s['FeedbackOutput'] = obj(dict(departments=arr(ref('FeedbackDepartment')),knowledgeCandidates=arr(ref('KnowledgeCandidate'),maxItems=400),relationshipCandidates=arr(ref('RelationshipCandidate'),maxItems=400),observations=arr(ref('FeedbackObservation'),maxItems=200)))
s['FeedbackOutput']['description'] = 'Maximum 400 candidates combined. PUBLISH needs evidence; ADD existingId is null; MERGE_EVIDENCE retains content and adds evidence only. Department identities stay fixed. Changed descriptions need ORGANIZATION support. The server allocates formal IDs and metadata.'
s['FeedbackPublication'] = obj(dict(projectId=uuid,addedKnowledgeItemIds=ids,mergedKnowledgeItemIds=ids,addedRelationshipIds=ids,mergedRelationshipIds=ids))
candidate = {'oneOf':[ref('KnowledgeCandidate'),ref('RelationshipCandidate')]}
s['FeedbackDiagnostics'] = obj(dict(heldCandidates=arr(candidate),discardedCandidates=arr(candidate),observations=arr(ref('FeedbackObservation'),maxItems=200)))
s['FeedbackResult'] = obj(dict(jobId=uuid,globalMemoryVersion=positive,publication=ref('FeedbackPublication'),diagnostics=ref('FeedbackDiagnostics')))
for page, item in [('KnowledgeItemPage','KnowledgeItem'),('RelationshipPage','DepartmentRelationship'),('ExperiencePage','ExperienceSummary'),('EvidencePage','Evidence')]:
    s[page] = obj(dict(version=positive,items=arr(ref(item)),total=version,limit=dict(type='integer',minimum=1,maximum=200),offset=version))
paths = {}
def parameter(n, location, schema, required=False, description=None):
    return dict(name=n, **{'in':location},schema=schema,required=required,**({'description':description} if description else {}))
def response(schema, desc): return dict(description=desc,content={'application/json':{'schema':ref(schema)}})
def endpoint(path, method, summary, out, code=200, body=None, params=None, description=''):
    parameters = list(params or [])
    for ident in ['projectId','workflowId','jobId']:
        if '{'+ident+'}' in path: parameters.append(parameter(ident,'path',uuid,True))
    if method=='post': parameters.append(parameter('Idempotency-Key','header',uuid,True,'永久冪等 key；相同路徑/key/body 回放原成功回應，不同 body 回傳 409。'))
    op = dict(summary=summary,operationId=method+out+path.replace('/','_').replace('{','').replace('}',''),tags=[path.split('/')[1]],responses={str(code):response(out,summary)},parameters=parameters)
    if description: op['description']=description
    for error in [400,404,409,413,500]: op['responses'][str(error)] = response('Error',{400:'參數或 JSON 不合法',404:'資源不存在',409:'狀態、版本、相依或冪等衝突',413:'JSON body 超過 10 MiB',500:'未預期錯誤'}[error])
    if body: op['requestBody']=dict(required=True,content={'application/json':{'schema':ref(body)}})
    paths.setdefault(path,{})[method]=op
pageparams = [parameter('limit','query',dict(type='integer',minimum=1,maximum=200,default=50)),parameter('offset','query',dict(type='integer',minimum=0,default=0))]
endpoint('/global-memory','post','初始化全系統共用的組織架構與部門職能','GlobalMemory',201,'InitializeMemory')
endpoint('/global-memory','get','查詢最新或指定版本的組織表','GlobalMemory',params=[parameter('version','query',positive)])
fixedpage = [parameter('version','query',positive,True)] + pageparams
department_filter = parameter('departmentId','query',uuid)
project_filter = parameter('projectId','query',uuid)
fixed_description = '必須指定固定 version，多頁沿用同一版本；limit 預設 50、範圍 1–200，offset 非負。舊版本成員與內容不隨新版本變動。'
endpoint('/global-memory/knowledge-items','get','查詢有來源及範圍的組織知識','KnowledgeItemPage',params=fixedpage+[department_filter,parameter('type','query',knowledge_type),parameter('scopeLevel','query',enum('ORGANIZATION','PROJECT')),project_filter],description=fixed_description)
endpoint('/global-memory/relationships','get','查詢有方向與來源的部門關係','RelationshipPage',params=fixedpage+[department_filter,parameter('type','query',relationship_fields['type'])],description=fixed_description)
endpoint('/global-memory/experiences','get','查詢已納入指定記憶版本的結案案例摘要','ExperiencePage',params=fixedpage+[department_filter,project_filter],description=fixed_description+' 案例依 closedAt、projectId 降冪；部門篩選只計 ASSIGNED。')
endpoint('/global-memory/experiences/{projectId}','get','查詢指定版本的完整結案案例','ExperienceResult',params=[parameter('version','query',positive,True)],description='不在該版本的案例回傳 404；REPORT_APPROVED 不宣稱工作已執行。')
endpoint('/global-memory/evidence','get','查詢可核對的原始來源與摘錄','EvidencePage',params=fixedpage+[parameter('knowledgeItemId','query',uuid),parameter('relationshipId','query',uuid),project_filter],description=fixed_description)
endpoint('/projects','post','建立專案、提交需求並啟動首次 AI 分析','CreateProjectResult',202,'CreateProject')
endpoint('/projects','get','查詢專案列表','ProjectPage',params=pageparams+[parameter('status','query',enum('OPEN','CLOSED'))])
endpoint('/projects/{projectId}','get','查詢專案詳情、需求內容與任務關聯','ProjectDetails')
endpoint('/projects/{projectId}/report','get','查詢報告、工作相依順序及歸屬結果','Report',description='以 DAG 拓撲排序回傳工作；每一步候選工作依 createdAt、id 升冪。相依 ID 陣列按 UUID 升冪。AI 指派的 assignmentReason 會隨 workflow 回傳。')
assignment_description='省略歸屬欄位時新增為 UNASSIGNED、修改時保留；只傳 departmentId 則有效 UUID 為 ASSIGNED、null 為 UNASSIGNED。明確 ASSIGNED 須提供 departmentId；UNKNOWN/UNASSIGNED 的 departmentId 須省略或 null。手動判定來源由後端設為 USER，並清除既有 AI assignmentReason。相依須同 Report、無重複、自我或循環。'
endpoint('/projects/{projectId}/workflows','post','在指定專案中手動新增工作任務及前置相依','WorkflowResult',201,'CreateWorkflow',description=assignment_description)
endpoint('/workflows/{workflowId}','patch','修改工作任務內容、前置相依或部門歸屬','WorkflowResult',body='PatchWorkflow',description=assignment_description+' 相依省略保留、[] 清空，null 不合法；僅重排不產生差異。')
endpoint('/workflows/{workflowId}','delete','刪除工作任務並保留變更紀錄','DeleteWorkflowResult',params=[parameter('expectedReportVersion','query',version,True),parameter('reason','query',text(2000))],description='有後續工作直接依賴時回傳 WORKFLOW_HAS_DEPENDENTS，details.dependentWorkflowIds 列出 ID。')
endpoint('/projects/{projectId}/analyses','post','啟動全部或僅未歸屬項目的 AI 歸屬分析','AnalysisResult',202,'AnalysisRequest',description='ALL_REANALYZE 接受時立即清除全部人工/AI 歸屬與 UNKNOWN；UNASSIGNED_ANALYZE 涵蓋 UNASSIGNED 及 UNKNOWN。保留名稱、描述與相依。')
endpoint('/projects/{projectId}/report-diffs','get','查詢報告的變更歷程','ReportDiffPage',params=pageparams)
endpoint('/projects/{projectId}/analysis-results','get','查詢不可變 AI 歸屬判斷、資訊缺口及引用','AnalysisRecordPage',params=pageparams+[parameter('jobId','query',uuid)],description='依 reportVersion 升冪。人工改派不修改歷史判斷；過往 explanation 不代表目前人工歸屬理由。')
endpoint('/projects/{projectId}/close','post','單人簽核結案並啟動回饋分析','CloseResult',202,'CloseRequest',description='結案立即生效，回饋失敗不撤銷。已結案以新 key 重送回 200 和相同回饋任務；原 key 回放 202。允許 UNKNOWN 或 UNASSIGNED。')
paths['/projects/{projectId}/close']['post']['responses']['200']=response('CloseResult','專案已結案，回傳既有結果')
endpoint('/jobs/{jobId}','get','查詢 AI 任務進度、結果及錯誤','Job')
endpoint('/jobs/{jobId}/feedback-result','get','查詢成功回饋發布結果及未採納診斷','FeedbackResult',description='FEEDBACK SUCCEEDED 才回傳 200。未成功回 409 FEEDBACK_RESULT_NOT_READY；非 FEEDBACK 回 409 WRONG_JOB_TYPE。不回傳供應商原始錯誤。')
endpoint('/jobs/{jobId}/retry','post','手動重試已失敗的 AI 任務','RetryResult',202,'RetryRequest',description='沿用 Job ID，新增批次與三次預算，保留歷史；報告版本已變更或專案結案時禁止重試舊分析。')
doc = dict(openapi='3.1.0',info=dict(title='Seax 工作流程與組織記憶 API',version='0.2.0',description='GlobalMemory schemaVersion 2：版本化知識、結案案例、scope、證據、UNKNOWN 原因及回饋診斷。POC 沿用 /api/v1；既有外部消費者需同步升級。必填文字不得只有空白。所有 POST 須 Idempotency-Key。Job、交易、重試及結案規則沿用 backend/spec.md；AI_INPUT_TOO_LARGE 不可重試，不以 UNKNOWN 掩蓋技術失敗。'),servers=[dict(url='/api/v1')],paths=paths,components=dict(schemas=s))
def validate_contract(document):
    """Catch incomplete publication of the version 2 contract before overwriting the artifact."""
    for path in ['/global-memory/knowledge-items', '/global-memory/relationships',
                 '/global-memory/experiences', '/global-memory/experiences/{projectId}',
                 '/global-memory/evidence', '/projects/{projectId}/analysis-results',
                 '/jobs/{jobId}/feedback-result']:
        assert 'get' in document['paths'].get(path, {}), 'Missing version 2 endpoint: ' + path
    schemas = document['components']['schemas']
    assert {'schemaVersion', 'counts'} <= schemas['GlobalMemory']['properties'].keys()
    assert 'AI_INPUT_TOO_LARGE' in schemas['JobError']['properties']['code']['enum']
    def walk(node):
        if isinstance(node, dict):
            if '$ref' in node:
                assert node['$ref'].split('/')[-1] in schemas, 'Unresolved schema reference'
            for value in node.values(): walk(value)
        elif isinstance(node, list):
            for value in node: walk(value)
    walk(document)

validate_contract(doc)
Path('src/main/resources/static/openapi.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
