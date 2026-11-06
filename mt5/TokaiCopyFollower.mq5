#property strict
#property version "1.00"
// Tokai Copy Follower — instalação individual por licença.
// A API controla o modo global; o EA nunca envia credenciais de corretora.
input string ApiUrl="";
input string License="";
input long ExpectedAccount=0;
input string ExpectedServer="";
input string GoldSymbol="XAUUSD";
input double LocalDailyLossPercent=10.0;
input long TokaiMagic=41277716;
string fingerprint,dayKey; double openingEquity=0; bool activated=false,lossLocked=false;
string Esc(string v){StringReplace(v,"\\","\\\\");StringReplace(v,"\"","\\\"");return v;}
string Fingerprint(){return IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"|"+AccountInfoString(ACCOUNT_SERVER)+"|"+TerminalInfoString(TERMINAL_DATA_PATH);}
string TokyoDay(){datetime t=TimeGMT()+9*3600;return TimeToString(t,TIME_DATE);}
bool Post(string path,string payload,string &response){
 char data[],result[];string headers;int n=StringToCharArray(payload,data,0,WHOLE_ARRAY,CP_UTF8);ArrayResize(data,n-1);
 int code=WebRequest("POST",ApiUrl+path,"Content-Type: application/json\\r\\n",8000,data,result,headers);
 response=CharArrayToString(result);return code==200;
}
bool Activate(){
 string r,p="{\"license\":\""+Esc(License)+"\",\"account\":\""+IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"fingerprint\":\""+Esc(fingerprint)+"\"}";
 return Post("/v1/copy/activate",p,r);
}
int OnInit(){
 if(StringFind(ApiUrl,"https://")!=0||StringLen(License)!=43||ExpectedAccount==0||ExpectedServer==""||AccountInfoInteger(ACCOUNT_LOGIN)!=ExpectedAccount||AccountInfoString(ACCOUNT_SERVER)!=ExpectedServer||!SymbolSelect(GoldSymbol,true))return INIT_PARAMETERS_INCORRECT;
 fingerprint=Fingerprint();dayKey=TokyoDay();openingEquity=AccountInfoDouble(ACCOUNT_EQUITY);activated=Activate();if(!activated)return INIT_FAILED;
 EventSetTimer(2);return INIT_SUCCEEDED;
}
void OnDeinit(const int reason){EventKillTimer();}
void OnTimer(){
 string today=TokyoDay();if(today!=dayKey){dayKey=today;openingEquity=AccountInfoDouble(ACCOUNT_EQUITY);lossLocked=false;}
 double equity=AccountInfoDouble(ACCOUNT_EQUITY),loss=openingEquity>0?(openingEquity-equity)*100.0/openingEquity:0;
 if(loss>=LocalDailyLossPercent)lossLocked=true;
 string r,p="{\"license\":\""+Esc(License)+"\",\"account\":\""+IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"\",\"server\":\""+Esc(AccountInfoString(ACCOUNT_SERVER))+"\",\"fingerprint\":\""+Esc(fingerprint)+"\",\"equity\":"+DoubleToString(equity,2)+"}";
 if(!Post("/v1/copy/plan",p,r)){Comment("TOKAI COPY: sem conexão");return;}
 if(lossLocked){Comment("TOKAI COPY: novas entradas pausadas — limite diário atingido");return;}
 Comment("TOKAI COPY: conectado. Aguardando plano autorizado.");
}
