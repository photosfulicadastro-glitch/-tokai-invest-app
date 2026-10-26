#property strict
#property version "1.20"
// Monitor somente leitura. Instalar em gráfico separado do robô.
input string ApiUrl="";
input string IngestToken="";
input string Source="principal";
input string GoldSymbol="XAUUSD";
input long ExpectedAccount=0;
input int HistoryDays=30;
datetime cursor=0;
ulong lastCandlesSent=0;
string cursorKey;
string Q(string s){StringReplace(s,"\\","\\\\");StringReplace(s,"\"","\\\"");StringReplace(s,"\r"," ");StringReplace(s,"\n"," ");return "\""+s+"\"";}
string N(double x){return DoubleToString(x,8);}
string ID(ulong x){return Q(StringFormat("%I64u",x));}
// Candle timestamps use broker time, as do deal timestamps.
string CandleSeries(ENUM_TIMEFRAMES period){
 MqlRates rates[];ArraySetAsSeries(rates,false);
 int copied=CopyRates(GoldSymbol,period,0,180,rates);
 if(copied<=0)return "[]";
 string result="[";
 for(int i=0;i<copied;i++){
  if(i>0)result+=",";
  result+="{\"time\":"+IntegerToString(rates[i].time)+",\"open\":"+N(rates[i].open)+",\"high\":"+N(rates[i].high)+",\"low\":"+N(rates[i].low)+",\"close\":"+N(rates[i].close)+"}";
 }
 return result+"]";
}
int OnInit(){
 if(StringFind(ApiUrl,"https://")!=0||StringLen(IngestToken)<32||ExpectedAccount==0||HistoryDays<1||HistoryDays>365)return INIT_PARAMETERS_INCORRECT;
 if(AccountInfoInteger(ACCOUNT_LOGIN)!=ExpectedAccount)return INIT_FAILED;
 if(!SymbolSelect(GoldSymbol,true))return INIT_FAILED;
 cursorKey="Tokai_"+IntegerToString(ExpectedAccount)+"_"+Source+"_"+GoldSymbol;
 cursor=GlobalVariableCheck(cursorKey)?(datetime)GlobalVariableGet(cursorKey):TimeCurrent()-HistoryDays*86400;
 EventSetTimer(1);return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){EventKillTimer();}
void OnTimer(){
 if(!TerminalInfoInteger(TERMINAL_CONNECTED)||AccountInfoInteger(ACCOUNT_LOGIN)!=ExpectedAccount)return;
 datetime end=TimeCurrent();
 if(!HistorySelect(cursor-2,end))return;
 string ds="",ps="";int count=0;datetime next=cursor;
 for(int i=0;i<HistoryDealsTotal();i++){
  ulong ticket=HistoryDealGetTicket(i);if(ticket==0)return;
  if(HistoryDealGetString(ticket,DEAL_SYMBOL)!=GoldSymbol)continue;
  long type=HistoryDealGetInteger(ticket,DEAL_TYPE);if(type!=DEAL_TYPE_BUY&&type!=DEAL_TYPE_SELL)continue;
  datetime dt=(datetime)HistoryDealGetInteger(ticket,DEAL_TIME);
  // Limit batches only at a second boundary, to avoid dropping same-second fills.
  if(count>=500&&dt>next&&next>cursor)break;
  if(count++>0)ds+=",";
  ds+="{\"id\":"+ID(ticket)+",\"position_id\":"+ID((ulong)HistoryDealGetInteger(ticket,DEAL_POSITION_ID))+",\"side\":"+Q(type==DEAL_TYPE_BUY?"BUY":"SELL")+",\"entry\":"+IntegerToString(HistoryDealGetInteger(ticket,DEAL_ENTRY))+",\"time\":"+IntegerToString(dt)+",\"volume\":"+N(HistoryDealGetDouble(ticket,DEAL_VOLUME))+",\"price\":"+N(HistoryDealGetDouble(ticket,DEAL_PRICE))+",\"profit\":"+N(HistoryDealGetDouble(ticket,DEAL_PROFIT))+",\"commission\":"+N(HistoryDealGetDouble(ticket,DEAL_COMMISSION))+",\"swap\":"+N(HistoryDealGetDouble(ticket,DEAL_SWAP))+",\"fee\":"+N(HistoryDealGetDouble(ticket,DEAL_FEE))+"}";
  if(dt>next)next=dt;
 }
 int pc=0;
 for(int i=0;i<PositionsTotal();i++){
  ulong ticket=PositionGetTicket(i);if(ticket==0)return;
  if(PositionGetString(POSITION_SYMBOL)!=GoldSymbol)continue;
  if(pc++>0)ps+=",";
  ps+="{\"id\":"+ID((ulong)PositionGetInteger(POSITION_IDENTIFIER))+",\"side\":"+Q(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL")+",\"volume\":"+N(PositionGetDouble(POSITION_VOLUME))+",\"price\":"+N(PositionGetDouble(POSITION_PRICE_OPEN))+",\"sl\":"+N(PositionGetDouble(POSITION_SL))+",\"tp\":"+N(PositionGetDouble(POSITION_TP))+",\"profit\":"+N(PositionGetDouble(POSITION_PROFIT))+"}";
 }
 MqlTick tick;if(!SymbolInfoTick(GoldSymbol,tick))return;
 string payload="{\"source\":"+Q(Source)+",\"symbol\":"+Q(GoldSymbol)+",\"currency\":"+Q(AccountInfoString(ACCOUNT_CURRENCY))+",\"observed_at\":"+IntegerToString(TimeGMT())+",\"bid\":"+N(tick.bid)+",\"ask\":"+N(tick.ask)+",\"positions\":["+ps+"],\"deals\":["+ds+"]}";
 bool sendCandles=lastCandlesSent==0 || GetTickCount64()-lastCandlesSent>=10000;
 if(sendCandles){
 string candles="{\"M1\":"+CandleSeries(PERIOD_M1)+",\"M5\":"+CandleSeries(PERIOD_M5)+",\"M15\":"+CandleSeries(PERIOD_M15)+"}";
 payload=StringSubstr(payload,0,StringLen(payload)-1)+",\"candles\":"+candles+"}";
 }
 char data[],response[];string headers;
 int size=StringToCharArray(payload,data,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(data,size-1);
 int code=WebRequest("POST",ApiUrl+"/v1/snapshot","Content-Type: application/json\r\nAuthorization: Bearer "+IngestToken+"\r\n",5000,data,response,headers);
 if(code==200){if(sendCandles)lastCandlesSent=GetTickCount64();cursor=next;GlobalVariableSet(cursorKey,(double)cursor);}else Print("TOKAI: falha de envio HTTP ",code,"; erro ",GetLastError());
}
