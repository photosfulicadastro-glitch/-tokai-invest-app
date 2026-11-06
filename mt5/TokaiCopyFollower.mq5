#property strict
#property version "1.10"
// TOKAI COPY FOLLOWER
// A conta da corretora permanece local no MT5. A licença é vinculada a uma única conta e instalação.
// V1: XAUUSD em contas MT5 com modo hedging. A API deve estar liberada em Ferramentas > Opções > Expert Advisors.
#include <Trade/Trade.mqh>

input string ApiUrl="";
input string License="";
input long ExpectedAccount=0;
input string ExpectedServer="";
input string GoldSymbol="XAUUSD";
input double LocalDailyLossPercent=10.0; // Pode ser menor que o teto da Tokai, nunca maior.
input double VolumeMultiplier=1.0;
input long TokaiMagic=41277716;
input int MaxSlippagePoints=30;
input int MasterMaxAgeSeconds=30;

struct MasterPosition{
 string id;
 string side;
 double volume;
 double sl;
 double tp;
};
CTrade trade;
string fingerprint,dayKey;
double openingEquity=0;
bool activated=false,lossLocked=false;
double currentDailyLoss=0;
string lastStatus="Inicializando";
string lastErrorKey="";
datetime lastErrorAt=0;

string Esc(string value){StringReplace(value,"\\","\\\\");StringReplace(value,"\"","\\\"");return value;}
string Fingerprint(){return IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"|"+AccountInfoString(ACCOUNT_SERVER)+"|"+TerminalInfoString(TERMINAL_DATA_PATH);}
string TokyoDay(){datetime t=TimeGMT()+9*3600;return TimeToString(t,TIME_DATE);}
string CommentFor(string masterId){return "TK:"+masterId;}
bool IsTokaiComment(string comment){return StringFind(comment,"TK:")==0;}
string MasterIdFromComment(string comment){return StringSubstr(comment,3);}

bool Post(string path,string payload,string &response){
 char data[],result[];string headers;
 int size=StringToCharArray(payload,data,0,WHOLE_ARRAY,CP_UTF8);
 if(size<=1)return false;
 ArrayResize(data,size-1);
 int code=WebRequest("POST",ApiUrl+path,"Content-Type: application/json\r\n",8000,data,result,headers);
 response=CharArrayToString(result);
 return code==200;
}
bool Activate(){
 string response,payload="{\"license\":\""+Esc(License)+"\",\"account\":\""+IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"fingerprint\":\""+Esc(fingerprint)+"\"}";
 return Post("/v1/copy/activate",payload,response);
}
string TicketText(ulong ticket){return ticket>0?StringFormat("%I64u",ticket):"";}
void Report(string eventType,string message,string masterId="",string copiedTicket=""){
 if(!activated)return;
 string ignored,payload="{\"license\":\""+Esc(License)+"\",\"account\":\""+IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"fingerprint\":\""+Esc(fingerprint)+"\",\"equity\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)+",\"event_type\":\""+Esc(eventType)+"\",\"message\":\""+Esc(message)+"\",\"master_position_id\":\""+Esc(masterId)+"\",\"copied_ticket\":\""+Esc(copiedTicket)+"\"}";
 Post("/v1/copy/report",payload,ignored);
}
void ReportError(string message,string masterId=""){
 string key=message+"|"+masterId;datetime now=TimeCurrent();
 if(key==lastErrorKey&&now-lastErrorAt<60)return;
 lastErrorKey=key;lastErrorAt=now;Report("error",message,masterId,"");
}
void SetStatus(string value,string eventType="status"){
 if(lastStatus==value)return;
 lastStatus=value;Report(eventType,value,"","");
}

bool JsonStringField(const string json,const string key,string &value){
 string needle="\""+key+"\":\"";
 int start=StringFind(json,needle);
 if(start<0)return false;
 start+=StringLen(needle);
 int finish=StringFind(json,"\"",start);
 if(finish<0)return false;
 value=StringSubstr(json,start,finish-start);
 return true;
}
bool JsonNumberField(const string json,const string key,double &value){
 string needle="\""+key+"\":";
 int start=StringFind(json,needle);
 if(start<0)return false;
 start+=StringLen(needle);
 int finish=start,total=StringLen(json);
 while(finish<total){
  ushort c=(ushort)StringGetCharacter(json,finish);
  if(!((c>=48&&c<=57)||c==45||c==43||c==46||c==69||c==101))break;
  finish++;
 }
 if(finish==start)return false;
 value=StringToDouble(StringSubstr(json,start,finish-start));
 return true;
}
int Matching(const string text,int start,ushort openChar,ushort closeChar){
 int depth=0,total=StringLen(text);bool quoted=false,escaped=false;
 for(int i=start;i<total;i++){
  ushort c=(ushort)StringGetCharacter(text,i);
  if(quoted){
   if(escaped){escaped=false;continue;}
   if(c==92){escaped=true;continue;}
   if(c==34)quoted=false;
   continue;
  }
  if(c==34){quoted=true;continue;}
  if(c==openChar)depth++;
  if(c==closeChar){depth--;if(depth==0)return i;}
 }
 return -1;
}
bool ParseMasterPositions(const string json,MasterPosition &positions[]){
 ArrayResize(positions,0);
 int marker=StringFind(json,"\"positions\":[");
 if(marker<0)return false;
 int open=StringFind(json,"[",marker),close=Matching(json,open,91,93);
 if(open<0||close<0)return false;
 int cursor=open+1,count=0;
 while(cursor<close){
  int objectStart=StringFind(json,"{",cursor);
  if(objectStart<0||objectStart>=close)break;
  int objectEnd=Matching(json,objectStart,123,125);
  if(objectEnd<0||objectEnd>close)return false;
  string object=StringSubstr(json,objectStart,objectEnd-objectStart+1),id,side;
  double volume,sl,tp;
  if(!JsonStringField(object,"id",id)||!JsonStringField(object,"side",side)||!JsonNumberField(object,"volume",volume)||!JsonNumberField(object,"sl",sl)||!JsonNumberField(object,"tp",tp)||volume<=0)return false;
  ArrayResize(positions,count+1);
  positions[count].id=id;positions[count].side=side;positions[count].volume=volume;positions[count].sl=sl;positions[count].tp=tp;
  count++;cursor=objectEnd+1;
 }
 return true;
}
bool IsMasterPresent(MasterPosition &positions[],string id){
 for(int i=0;i<ArraySize(positions);i++)if(positions[i].id==id)return true;
 return false;
}
bool AccountIsAllowed(string mode){
 ENUM_ACCOUNT_TRADE_MODE accountMode=(ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
 if(mode=="both")return accountMode==ACCOUNT_TRADE_MODE_DEMO||accountMode==ACCOUNT_TRADE_MODE_REAL;
 if(mode=="demo")return accountMode==ACCOUNT_TRADE_MODE_DEMO;
 if(mode=="real")return accountMode==ACCOUNT_TRADE_MODE_REAL;
 return false;
}
bool TradeResultOk(){
 uint code=trade.ResultRetcode();
 return code==TRADE_RETCODE_DONE||code==TRADE_RETCODE_DONE_PARTIAL||code==TRADE_RETCODE_PLACED;
}
int VolumeDigits(){
 double step=SymbolInfoDouble(GoldSymbol,SYMBOL_VOLUME_STEP);
 for(int d=0;d<=8;d++)if(MathAbs(step-NormalizeDouble(step,d))<0.000000001)return d;
 return 2;
}
double NormalizeVolume(double volume){
 double min=SymbolInfoDouble(GoldSymbol,SYMBOL_VOLUME_MIN),max=SymbolInfoDouble(GoldSymbol,SYMBOL_VOLUME_MAX),step=SymbolInfoDouble(GoldSymbol,SYMBOL_VOLUME_STEP);
 if(step<=0||volume<min-step/2)return 0;
 volume=MathMin(volume,max);
 return NormalizeDouble(MathFloor(volume/step+0.0000001)*step,VolumeDigits());
}
double PositionVolumeFor(string masterId){
 double volume=0;string wanted=CommentFor(masterId);
 for(int i=PositionsTotal()-1;i>=0;i--){
  ulong ticket=PositionGetTicket(i);
  if(ticket==0||!PositionSelectByTicket(ticket))continue;
  if(PositionGetInteger(POSITION_MAGIC)!=(long)TokaiMagic||PositionGetString(POSITION_COMMENT)!=wanted)continue;
  volume+=PositionGetDouble(POSITION_VOLUME);
 }
 return volume;
}
bool HasOppositeSide(string masterId,string side){
 string wanted=CommentFor(masterId);
 for(int i=PositionsTotal()-1;i>=0;i--){
  ulong ticket=PositionGetTicket(i);
  if(ticket==0||!PositionSelectByTicket(ticket))continue;
  if(PositionGetInteger(POSITION_MAGIC)!=(long)TokaiMagic||PositionGetString(POSITION_COMMENT)!=wanted)continue;
  ENUM_POSITION_TYPE type=(ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
  if((side=="BUY"&&type!=POSITION_TYPE_BUY)||(side=="SELL"&&type!=POSITION_TYPE_SELL))return true;
 }
 return false;
}
bool OpenForMaster(MasterPosition &master,double volume){
 volume=NormalizeVolume(volume);
 if(volume<=0)return false;
 bool sent=master.side=="BUY"?trade.Buy(volume,GoldSymbol,0,master.sl,master.tp,CommentFor(master.id)):trade.Sell(volume,GoldSymbol,0,master.sl,master.tp,CommentFor(master.id));
 if(!sent||!TradeResultOk()){string message="Falha ao abrir: "+trade.ResultRetcodeDescription();Print("TOKAI COPY: ",message," ",master.id);ReportError(message,master.id);return false;}
 Report("opened",(master.side=="BUY"?"Compra":"Venda")+" copiada",master.id,TicketText(trade.ResultDeal()));
 return true;
}
void ModifyForMaster(MasterPosition &master){
 string wanted=CommentFor(master.id);
 double point=SymbolInfoDouble(GoldSymbol,SYMBOL_POINT);if(point<=0)point=_Point;
 for(int i=PositionsTotal()-1;i>=0;i--){
  ulong ticket=PositionGetTicket(i);
  if(ticket==0||!PositionSelectByTicket(ticket))continue;
  if(PositionGetInteger(POSITION_MAGIC)!=(long)TokaiMagic||PositionGetString(POSITION_COMMENT)!=wanted)continue;
  double currentSl=PositionGetDouble(POSITION_SL),currentTp=PositionGetDouble(POSITION_TP);
  if(MathAbs(currentSl-master.sl)<=point/2&&MathAbs(currentTp-master.tp)<=point/2)continue;
  if(!trade.PositionModify(ticket,master.sl,master.tp)||!TradeResultOk()){string message="Falha ao ajustar SL/TP: "+trade.ResultRetcodeDescription();Print("TOKAI COPY: ",message," ",master.id);ReportError(message,master.id);}else Report("modified","SL/TP atualizado",master.id,TicketText(ticket));
 }
}
void CloseMaster(string masterId){
 string wanted=CommentFor(masterId);
 for(int i=PositionsTotal()-1;i>=0;i--){
  ulong ticket=PositionGetTicket(i);
  if(ticket==0||!PositionSelectByTicket(ticket))continue;
  if(PositionGetInteger(POSITION_MAGIC)!=(long)TokaiMagic||PositionGetString(POSITION_COMMENT)!=wanted)continue;
  if(!trade.PositionClose(ticket,(ulong)MaxSlippagePoints)||!TradeResultOk()){string message="Falha ao fechar: "+trade.ResultRetcodeDescription();Print("TOKAI COPY: ",message," ",masterId);ReportError(message,masterId);}else Report("closed","Posição fechada",masterId,TicketText(ticket));
 }
}
void ReduceTo(string masterId,double wanted){
 double current=PositionVolumeFor(masterId),difference=NormalizeVolume(current-wanted);
 if(difference<=0)return;
 string comment=CommentFor(masterId);
 for(int i=PositionsTotal()-1;i>=0&&difference>0;i--){
  ulong ticket=PositionGetTicket(i);
  if(ticket==0||!PositionSelectByTicket(ticket))continue;
  if(PositionGetInteger(POSITION_MAGIC)!=(long)TokaiMagic||PositionGetString(POSITION_COMMENT)!=comment)continue;
  double volume=PositionGetDouble(POSITION_VOLUME);
  if(difference>=volume-SymbolInfoDouble(GoldSymbol,SYMBOL_VOLUME_STEP)/2){
   if(trade.PositionClose(ticket,(ulong)MaxSlippagePoints)&&TradeResultOk()){difference-=volume;Report("reduced","Volume reduzido",masterId,TicketText(ticket));}else ReportError("Falha ao reduzir: "+trade.ResultRetcodeDescription(),masterId);
  }else{
   if(trade.PositionClosePartial(ticket,difference,(ulong)MaxSlippagePoints)&&TradeResultOk()){difference=0;Report("reduced","Volume reduzido",masterId,TicketText(ticket));}else ReportError("Falha ao reduzir: "+trade.ResultRetcodeDescription(),masterId);
  }
 }
}
void CloseRemoved(MasterPosition &masters[]){
 for(int i=PositionsTotal()-1;i>=0;i--){
  ulong ticket=PositionGetTicket(i);
  if(ticket==0||!PositionSelectByTicket(ticket))continue;
  if(PositionGetInteger(POSITION_MAGIC)!=(long)TokaiMagic)continue;
  string comment=PositionGetString(POSITION_COMMENT);
  if(!IsTokaiComment(comment)||IsMasterPresent(masters,MasterIdFromComment(comment)))continue;
  if(!trade.PositionClose(ticket,(ulong)MaxSlippagePoints)||!TradeResultOk()){string message="Falha ao fechar posição removida: "+trade.ResultRetcodeDescription();Print("TOKAI COPY: ",message);ReportError(message,MasterIdFromComment(comment));}else Report("closed","Fechamento recebido da conta-mãe",MasterIdFromComment(comment),TicketText(ticket));
 }
}
void SyncPositions(MasterPosition &masters[],bool allowNewEntries){
 for(int i=0;i<ArraySize(masters);i++){
  MasterPosition master=masters[i];
  double wanted=NormalizeVolume(master.volume*VolumeMultiplier);
  if(wanted<=0){Print("TOKAI COPY: volume inválido para ",master.id);continue;}
  if(HasOppositeSide(master.id,master.side)){
   CloseMaster(master.id);
   if(allowNewEntries)OpenForMaster(master,wanted);
   continue;
  }
  double current=PositionVolumeFor(master.id);
  if(current<=0){
   if(allowNewEntries)OpenForMaster(master,wanted);
   continue;
  }
  ModifyForMaster(master);
  double step=SymbolInfoDouble(GoldSymbol,SYMBOL_VOLUME_STEP);
  if(current>wanted+step/2)ReduceTo(master.id,wanted);
  if(current<wanted-step/2&&allowNewEntries)OpenForMaster(master,wanted-current);
 }
 CloseRemoved(masters);
}
void PollAndCopy(){
 string response,payload="{\"license\":\""+Esc(License)+"\",\"account\":\""+IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"fingerprint\":\""+Esc(fingerprint)+"\",\"equity\":"+DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),2)+"}";
 if(!Post("/v1/copy/plan",payload,response)){SetStatus("Sem conexão ou licença revogada","error");return;}
 string mode;
 double serverLimit,observedAt;
 MasterPosition masters[];
 if(!JsonStringField(response,"execution_mode",mode)||!JsonNumberField(response,"max_daily_loss_percent",serverLimit)||!JsonNumberField(response,"observed_at",observedAt)||!ParseMasterPositions(response,masters)){SetStatus("Plano inválido ou conta-mãe indisponível","error");return;}
 if(TimeGMT()-(datetime)observedAt>MasterMaxAgeSeconds){SetStatus("Conta-mãe sem atualização recente");return;}
 if(mode=="off"){SetStatus("Copy desligado pelo administrador");return;}
 if(!AccountIsAllowed(mode)){SetStatus("Conta não permitida pelo modo global","blocked");return;}
 double limit=MathMin(LocalDailyLossPercent,serverLimit);
 bool limitLocked=currentDailyLoss>=limit;
 bool allowNewEntries=!lossLocked&&!limitLocked&&limit>0;
 SyncPositions(masters,allowNewEntries);
 SetStatus((lossLocked||limitLocked)?"Novas entradas pausadas por limite diário":"Sincronizado — "+IntegerToString(ArraySize(masters))+" posição(ões) da conta-mãe",(lossLocked||limitLocked)?"blocked":"status");
}
int OnInit(){
 if(StringFind(ApiUrl,"https://")!=0||StringLen(License)!=43||ExpectedAccount==0||ExpectedServer==""||AccountInfoInteger(ACCOUNT_LOGIN)!=ExpectedAccount||AccountInfoString(ACCOUNT_SERVER)!=ExpectedServer||!SymbolSelect(GoldSymbol,true))return INIT_PARAMETERS_INCORRECT;
 if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)!=ACCOUNT_MARGIN_MODE_RETAIL_HEDGING){Print("TOKAI COPY requer conta MT5 em modo hedging.");return INIT_PARAMETERS_INCORRECT;}
 if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)||!MQLInfoInteger(MQL_TRADE_ALLOWED)||!AccountInfoInteger(ACCOUNT_TRADE_EXPERT)){Print("TOKAI COPY: negociação algorítmica não permitida.");return INIT_FAILED;}
 fingerprint=Fingerprint();dayKey=TokyoDay();openingEquity=AccountInfoDouble(ACCOUNT_EQUITY);
 trade.SetExpertMagicNumber((ulong)TokaiMagic);trade.SetDeviationInPoints((ulong)MaxSlippagePoints);trade.SetTypeFillingBySymbol(GoldSymbol);
 activated=Activate();if(!activated){Print("TOKAI COPY: ativação recusada.");return INIT_FAILED;}
 Report("activated","Licença ativada para esta instalação","","");
 EventSetTimer(2);lastStatus="Ativado; aguardando plano";return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){EventKillTimer();}
void OnTimer(){
 string today=TokyoDay();
 if(today!=dayKey){dayKey=today;openingEquity=AccountInfoDouble(ACCOUNT_EQUITY);lossLocked=false;}
 double equity=AccountInfoDouble(ACCOUNT_EQUITY);currentDailyLoss=openingEquity>0?(openingEquity-equity)*100.0/openingEquity:0;
 if(currentDailyLoss>=LocalDailyLossPercent)lossLocked=true;
 PollAndCopy();
 Comment("TOKAI COPY\n"+lastStatus+"\nPerda diária: "+DoubleToString(MathMax(0,currentDailyLoss),2)+"%"+(lossLocked?" — novas entradas pausadas":""));
}
