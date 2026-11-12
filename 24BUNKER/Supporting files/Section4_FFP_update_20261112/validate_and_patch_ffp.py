import zipfile,xml.etree.ElementTree as E,re,collections,math,pathlib,hashlib,json,html
ROOT=pathlib.Path(r'C:\Users\razza\house_inspection_record\24BUNKER')
SOURCE=ROOT/'24BUNKER_OLD_FFP_SHEET_NonCorrosion_KW.xlsm'
OUT=ROOT/'Section4_FFP_update_20261112'/SOURCE.name
N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
assert not OUT.exists()
source_bytes=SOURCE.read_bytes(); source_hash=hashlib.sha256(source_bytes).hexdigest()
assert source_hash=='c3d140cb34f782b7ae9d70c18b25bbb63eba0f039fcb0b2c783f16a9edc7de21', 'Source changed'
def failure(method,S,D,t,depth,L,W):
 d=depth/100; v=L**2/(D*t)
 if method in ['Modified B31.G','Detailed RSTRENG']:
  M=math.sqrt(1+.6275*v-.003375*v*v) if v<=50 else .032*v+3.3;k=.85 if method=='Modified B31.G' else 1
  return (S+68.95)*20*t/D*(1-k*d)/(1-k*d/M)
 if method=='Shannon':
  L=min(L,5/42*math.sqrt(6594)*math.sqrt(D*t));v=L**2/(D*t);M=math.sqrt(1+.6275*v-.003375*v*v)
  return 1.15*S*20*t/D*(1-d)/(1-d/M)
 if method=='Kastner':
  pi=3.14159265358979
  def f(w):
   a=1-d;b=w/D;return a*(pi-b*(1-a))/(a*pi+2*(1-a)*math.sin(b))*(1.15*S*40*t/D)
  old=10000;lim=10000;small=1;w=5
  while w<W:
   val=f(w)
   if val>old:small=val;lim=w;break
   old=val;w+=5
  return small if W>=lim else f(W if W else .000001)
 raise ValueError(method)
def critical(method,S,D,t,P,L,W):
 v=L**2/(D*t)
 if method in ['Modified B31.G','Detailed RSTRENG']:
  M=math.sqrt(1+.6275*v-.003375*v*v) if v<=50 else .032*v+3.3;r=P*D/(20*t)/(S+68.95);k=.85 if method=='Modified B31.G' else 1
  return min(.8,max(.1,(1-r)/(k*(1-r/M))))*100
 if method=='Shannon':
  L=min(L,5/42*math.sqrt(6594)*math.sqrt(D*t));v=L**2/(D*t);M=math.sqrt(1+.6275*v-.003375*v*v);r=P*D/(20*t)/(1.15*S)
  return (1-r)/(1-r/M)*100
 if method=='Kastner':
  pi=3.14159265358979;r=P*D/(40*t)/(1.15*S)
  def f(w):
   b=w/D;v=pi/b*(1-r)+2*r/b*math.sin(b)-1
   return 1-(-.5*v+.5*math.sqrt(v*v+8*r/b*math.sin(b)))
  old=100;lim=10000;small=100;w=5
  while w<W:
   val=f(w)
   if val>old:small=val;lim=w;break
   old=val;w+=5
  return (small if W>=lim else f(W if W else .000001))*100
 raise ValueError(method)
with zipfile.ZipFile(SOURCE) as z:
 parts={i.filename:z.read(i.filename)for i in z.infolist()};infos=z.infolist()
strings=[''.join(i.itertext())for i in E.fromstring(parts['xl/sharedStrings.xml'])]
def cells(part):
 out={}
 for c in E.fromstring(parts[part]).findall('.//s:sheetData/s:row/s:c',N):
  v=c.find('s:v',N);val=v.text if v is not None else None
  if c.attrib.get('t')=='s' and val:val=strings[int(val)]
  if val is not None:out[c.attrib['r']]=val
 return out
ac=cells('xl/worksheets/sheet6.xml');cd=cells('xl/worksheets/sheet7.xml');stats=cells('xl/worksheets/sheet4.xml')
assert stats.get('C3','')=='', 'Unexpected base date'
rows={}
for a,v in ac.items():
 i=int(re.sub('[A-Z]','',a));c=re.sub('[0-9]','',a)
 if i>1:rows.setdefault(i,{})[c]=v
rows={i:r for i,r in rows.items()if 'AZ'in r};assert set(rows)==set(range(2,63))
groups=[('BC','BD','BE','BF','BG','BH','BI','BJ','BK','BL'),('BM','BN','BO','BP','BQ','BR','BS','BT','BU','BV'),('BW','BX','BY','BZ','CA','CB','CC','CD','CE','CF'),('CG','CH','CI','CJ','CK','CL','CM','CN','CO','CP')]
new={};checks=[];before_calc={}
for i,r in rows.items():
 g=lambda c:float(r[c]); nr={}; baseline={}
 for mc,sfc,fc,sc,rc,dc,cgc,rtc,dtc,tc in groups:
  method=r[mc];S=g('M');D=g('O');t=g('E');depth=g('X')if method=='Detailed RSTRENG'else g('AY');L=g('W')if method=='Detailed RSTRENG'else g('J');W=g('K');P=g('T');sf=g(sfc)
  assert sf==1.39
  vals={fc:failure(method,S,D,t,depth,L,W),rc:critical(method,S,D,t,P*sf,L,W),dc:critical(method,S,D,t,P,L,W)}
  for c,v in vals.items():checks.append({'cell':f'Assessment_Sheet!{c}{i}','stored':g(c),'recomputed':v,'absolute_error':abs(v-g(c))})
  rd=critical(method,S,D,t,P*1.28,L,W);nr[sfc]=1.28;nr[sc]=vals[fc]/1.28;nr[rc]=rd
  nr[tc]=(min(80-g('AY'),rd-g('X'))if method=='Detailed RSTRENG'else rd-g('AY'))/100*t/g(cgc)
  nr[rtc]=nr[tc]*365
  old_time=(min(80-g('AY'),vals[rc]-g('X'))if method=='Detailed RSTRENG'else vals[rc]-g('AY'))/100*t/g(cgc)
  for c,v in [(sc,vals[fc]/sf),(tc,old_time),(rtc,old_time*365)]:checks.append({'cell':f'Assessment_Sheet!{c}{i}','stored':g(c),'recomputed':v,'absolute_error':abs(v-g(c))})
 nr['CU']=min(nr['CJ'],nr['BZ']);nr['CV']=min(nr['CP'],nr['CF']);nr['DA']=nr['CU'];new[i]=nr
 for c,v in [('CU',min(g('CJ'),g('BZ'))),('CV',min(g('CP'),g('CF'))),('DA',g('CU'))]:checks.append({'cell':f'Assessment_Sheet!{c}{i}','stored':g(c),'recomputed':v,'absolute_error':abs(v-g(c))})
chart_updates={}
for col in ['C','E']:
 g=lambda r:float(cd[f'{col}{r}']);method=cd[f'{col}13'];assert g(7)==1.39
 chart_updates[f'{col}7']=1.28;pressure=g(8)*1.28;smysratio=pressure*g(5)/(40*g(6)if method=='Kastner' else 20*g(6))/g(3)
 chart_updates[f'{col}10']=pressure;chart_updates[f'{col}11']=smysratio
 chart_updates[f'{col}12']=f' {method} @ Assessment Pressure x 1.28 ({smysratio:.0%} SMYS, {pressure:.1f} bar)'
 for i in range(15,216):
  L=float(cd[f'A{i}']);baseline=critical(method,g(3),g(5),g(6),g(10),L,L)
  checks.append({'cell':f'ChartData!{col}{i}','stored':g(i),'recomputed':baseline,'absolute_error':abs(baseline-g(i))})
  chart_updates[f'{col}{i}']=critical(method,g(3),g(5),g(6),pressure,L,L)
assert max(c['absolute_error']for c in checks)<1e-6, sorted(checks,key=lambda c:c['absolute_error'],reverse=True)[:5]
updates={f'{c}{i}':v for i,r in new.items()for c,v in r.items()if abs(v-float(rows[i][c]))>1e-8}
formula_roots=['BD2','BD3','BN2','BN3','BX2','BX3']
changed_parts={};change_ledger=[]
def patch_cells(part,up,formula_roots=()):
 txt=parts[part].decode('utf-8');seen=set()
 def sub(m):
  a=m.group(1);body=m.group(0)
  if a not in up and a not in formula_roots:return body
  old=body
  if a in formula_roots:
   assert ',1.54,1.39)'in body
   body=body.replace(',1.54,1.39)',',1.54,1.28)')
  if a in up:
   val=up[a];vstr=format(val,'.17g')if isinstance(val,(float,int))else html.escape(val,quote=False)
   body,n=re.subn(r'(<v\b[^>]*>)[\s\S]*?(</v>)',lambda v:v.group(1)+vstr+v.group(2),body,count=1);assert n==1,a
  seen.add(a);change_ledger.append({'part':part,'cell':a,'before_xml':old,'after_xml':body})
  return body
 result=re.sub(r'<c\b[^>]*\br="([A-Z]+[0-9]+)"[^>]*>[\s\S]*?</c>',sub,txt)
 assert seen==set(up)|set(formula_roots),(seen,set(up)|set(formula_roots))
 changed_parts[part]=result.encode('utf-8')
patch_cells('xl/worksheets/sheet6.xml',updates,formula_roots)
patch_cells('xl/worksheets/sheet7.xml',chart_updates)
chartpart='xl/charts/chart2.xml';ct=parts[chartpart].decode('utf-8');count=[0]
def series(m):
 block=m.group(0)
 if '<c:f>Assessment_Sheet!$DA$2:$DA$62</c:f>'not in block:return block
 def point(p):
  idx=int(p.group(1));old=float(p.group(2));assert abs(old-float(rows[idx+2]['DA']))<1e-8
  count[0]+=1;return f'<c:pt idx="{idx}"><c:v>{new[idx+2]["DA"]:.17g}</c:v></c:pt>'
 return re.sub(r'<c:pt idx="(\d+)"><c:v>([^<]+)</c:v></c:pt>',point,block)
ct=re.sub(r'<c:numRef>[\s\S]*?</c:numRef>',series,ct);assert count[0]==61
changed_parts[chartpart]=ct.encode('utf-8')
with zipfile.ZipFile(OUT,'w')as out:
 for info in infos:out.writestr(info,changed_parts.get(info.filename,parts[info.filename]))
with zipfile.ZipFile(OUT)as final:
 assert final.testzip()is None
 assert set(final.namelist())==set(parts)
 actual_changed=[p for p,b in parts.items()if final.read(p)!=b];assert set(actual_changed)==set(changed_parts)
 for name in final.namelist():
  if name.endswith('.xml'):E.fromstring(final.read(name))
 for a,v in updates.items():
  cells_final={c.attrib['r']:c for c in E.fromstring(final.read('xl/worksheets/sheet6.xml')).findall('.//s:sheetData/s:row/s:c',N)}
  got=float(cells_final[a].find('s:v',N).text);assert got==v
 assert final.read('xl/vbaProject.bin')==parts['xl/vbaProject.bin']
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
metrics={}
for col in ['BF','BP','BZ','CJ','CU','BG','BQ','CA','CK','BL','BV','CF','CP','CV','BJ','BT','CD','CN']:
 bef=[float(r[col])for r in rows.values()];aft=[new[i][col]for i in rows]
 metrics[col]={'count':61,'changed_count':sum(abs(a-b)>1e-8 for a,b in zip(aft,bef)),'before_min':min(bef),'after_min':min(aft),'before_max':max(bef),'after_max':max(aft)}
audit={'source':str(SOURCE),'output':str(OUT),'source_sha256':source_hash,'output_sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'source_unchanged':True,'vba_executed':False,'native_excel_recalculation_performed':False,'method':'Independent equation implementation from inspected embedded UDF source; verified baseline before exact OOXML cache patch.','factor_before':1.39,'factor_after':1.28,'factor_formula_roots':formula_roots,'dnv_alternative_1_54_preserved':True,'factor_rows':61,'factor_columns':['BD','BN','BX','CH'],'baseline_checks':len(checks),'baseline_max_absolute_error':max(c['absolute_error']for c in checks),'chart_cache_points_updated':61,'changed_package_parts':actual_changed,'metrics':metrics,'below_assessment_pressure_before':0,'below_assessment_pressure_after':0,'within_five_years_before':0,'within_five_years_after':0,'limitations':['The open original remains unchanged at1.39.','Stats!C3 is blank in the source and is preserved. Absolute calendar repair dates are not validated; existing formulas treat blank as zero.','Pre-existing error cells in template/helper sheets remain unchanged.','No native Excel recalculation or rendered visual review was performed; workbook source formatting and all unrelated package parts are preserved.','Manual verification of the report is required prior to transmittal.'],'transmittal_status':'manual_verification_required','baseline_checks_detail':checks,'changed_cells_detail':change_ledger}
(OUT.parent/'FFP_factor_1p28_validation.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in audit.items()if k not in ['baseline_checks_detail','changed_cells_detail']},indent=2))

