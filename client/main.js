//access link
function getAccessLink()
{
  var game = getCurrentGame();
  if (!game){
    return;
  }
  return game.accessCode;
}
function urlLink()
{
  return window.location.href;
}
//--
function stateMachine()
{
  var gameID = Session.get("gameID");
  var playerID = Session.get("playerID");
//if have no game and player yet -> start_screen
  if(!gameID || !playerID){

      Session.set("template_select","start_screen");
      return;
  }

  var game = Games.findOne(gameID);
  var player = Players.findOne(playerID);
  if (!game || !player){
      Session.set("gameID", null);
      Session.set("playerID", null);
      Session.set("template_select", "start_screen");
      return;
  }
  //playerlist
  if(game.state === "waitingForPlayers"){
    Session.set("template_select","queue_list");
  }
  //day message
  else if(game.state === "day")
  {
    Session.set("template_select","day");
  }
  //night message
   else if(game.state === "night")
  {
    Session.set("template_select","day");
  }
  //inspection sniper
  else if(game.state === "inspection")
  {
    Session.set("template_select","day");
  }
  //medic doctor
  else if(game.state === "medic")
  {
    Session.set("template_select","day");
  }
  //game over
  else if(game.state === "game_over")
  {
    Session.set("template_select","game_over");
  }
  //nothing -> start_screen
  else if(game.state === null)
  {
    Session.set("template_select","start_screen");
  }
}
//copy from Spyfall
function createSessionID()
{
  var ID = "";
  var options = "abcdefghijklmnopqrstuvwxyz";
    for(var i=0; i < 6; i++){
      ID += options.charAt(Math.floor(Math.random() * options.length));
    }
    return ID;
}
//--
function getCurrentGame()
{
  var gameID = Session.get("gameID");
  if (gameID) {
    return Games.findOne(gameID);
  }
}

function getCurrentPlayer()
{
  var playerID = Session.get("playerID");
  if (playerID) {
    return Players.findOne(playerID);
  }
}
function getVotedPlayer(id)
{
  if (id) {
    return Players.findOne(id);
  }
}
function generateNewGame(game, name)
{
  var todo='';
  if(Session.get('want_doctor')){
    todo='Doctor';
  }else if(Session.get('want_inspec')){
    todo='Inspector';
  }else{
    todo='Mafia';
  }
  var game = {
    accessCode: createSessionID(),
    createdAt: moment().toDate().getTime(),//moment library for date
    state: "waitingForPlayers",
    gameTime: "Night",//memo maybe change to nighttime //todo
    global: true,//variable for local game or global
    special: null, //This is the end game message
    winner: null, //Who the winner is
    waiting: todo, //Display who we're waiting on
    day: 1 // Length of Game
  };
  var gameID = Games.insert(game);//insert game to Collection
  game = Games.findOne(gameID);
  return game;
}

function generateNewPlayer(game, name, pass)
  {
  var player = {
    gameID: game._id,
    createdAt:  moment().toDate().getTime(),
    name: name,
    pass: pass, //password
    colour: 'sms_01', //chat colour
    role: null, //players role
    voteCast: null, //who player voted
    isNarrator: false, //Is player narrator
    votes: 0, //how many votes player has
    isMafia: false, //Is player mafia
    healed: false, //has doctor healed player
    alive: true //Is player alive
  };

  var playerID = Players.insert(player);

  return Players.findOne(playerID);
}

function createCustomArray(word,amount)
{
  var tempArray = [];
  if (amount != 0) {
      for (var i = 0; i < amount; i++) {
          tempArray.push(word);
      }
      return tempArray;
  }
  return tempArray;
}

//this handles the votes and if someone wins
function checkVotes(day)
{
    var game = getCurrentGame();
    //fetch all the player and mafia
    var totalPlayers = Players.find({'gameID': game._id,  'alive': true, 'isNarrator': false},{}).fetch();

    var totalMafia = Players.find({'gameID': game._id,'isMafia':true, 'alive':true},{}).fetch();
    //load chat to purge
    var chats = Chat.find({'game': game._id},{}).fetch();
    //get player with highest votes
    var player = Players.findOne({'gameID': game._id}, {'sort': {'votes': -1}});

    if(day == "day")
    {
     if(player.votes > (totalPlayers.length / 2 ))
     {
        communityNews(player.name);
        Players.update(player._id, {$set: {alive: false}});

        totalMafia = Players.find({'gameID': game._id,'isMafia':true, 'alive':true},{}).fetch();
        var totalOther = Players.find({'gameID': game._id,'isMafia':false, 'alive':true, 'isNarrator': false},{}).fetch();

        if(totalMafia.length === 0)
        {
            GAnalytics.event("game-events", "civilianswin-day-gameend");
            Games.update(game._id, {$set: {winner: "Civilians",special: "杀手全部被处刑。",state: 'game_over'}});
        }
        else if(totalOther.length === 0)
        {
        	GAnalytics.event("game-events", "mafiawin-day-gameend");
            Games.update(game._id, {$set: {winner: "The Mafia",special: "杀手笑到了最后。",state: 'game_over'}});
        }
        else if(totalMafia.length === totalOther.length)
        {
        	GAnalytics.event("game-events", "mafiawin-day-gameend");
            Games.update(game._id, {$set: {winner: "The Mafia",special: "杀手和群众人数一样，杀手获胜。",state: 'game_over'}});
        }
        else
        {//if game is still runing -> turn gametime to night
          Games.update(game._id, {$set: {gameTime: "Night"}});
          totalPlayers.forEach(function(each)
          {
            Players.update(each._id, {$set: {votes: 0,voteCast: null}});
          });
          //purge chat at the end of every phase
          chats.forEach(function(chat){
            Chat.remove(chat._id);
          });
          //may be remove this later
          var isInspectorStillAlive = Players.find({'gameID': game._id,  'alive': true, 'role': 'inspector'},{}).fetch();
          var isDoctorStillAlive = Players.find({'gameID': game._id,  'alive': true, 'role': 'doctor'},{}).fetch();
          if (isInspectorStillAlive.length >= 1 && isDoctorStillAlive.length == 1)
          {
            Games.update(game._id, {$set: {waiting: "Inspector",state: 'inspection'}});
          }
          else if (isInspectorStillAlive.length >= 1 && isDoctorStillAlive.length == 0)
          {
            Games.update(game._id, {$set: {waiting: "Inspector",state: 'inspection'}});
          }
          else if(isDoctorStillAlive.length == 1 && isInspectorStillAlive.length == 0 )
          {
            Games.update(game._id, {$set: {waiting: "Doctor",state: 'medic'}});
          }
          else
          {
            Games.update(game._id, {$set: {waiting: "Mafia",state: 'night'}});
          }
        }
      }
      else
      {
        Games.update(game._id,{$set:{waiting: "Players"}});
      }
    }
    else
    {
       if(player.votes == totalMafia.length)
        {
          if(player.healed == false)
          {
            mafiaNews(player.name,false);
            Players.update(player._id, {$set: {alive: false}});
          }
          else
          {
            mafiaNews(player.name,true);
          }
          totalMafia = Players.find({'gameID': game._id,'isMafia':true, 'alive':true},{}).fetch();
          var totalOther = Players.find({'gameID': game._id,'isMafia':false, 'alive':true, 'isNarrator': false},{}).fetch();

          if(totalMafia.length === 0)
          {
          	GAnalytics.event("game-events", "civilianswin-night-gameend");
            Games.update(game._id, {$set: {winner: "Civilians",special: "杀手已经全部被处死。",state: 'game_over'}});
          }
          else if(totalOther.length === 0)
          {
          	GAnalytics.event("game-events", "mafiawin-night-gameend");
            Games.update(game._id, {$set: {winner: "The Mafia",special: "杀手笑到了最后",state: 'game_over'}});
          }
          else if(totalMafia.length === totalOther.length)
          {
          	GAnalytics.event("game-events", "mafiawin-night-gameend");
            Games.update(game._id, {$set: {winner: "The Mafia",special: "杀手和群众人数一样，杀手获胜。",state: 'game_over'}});
          }
          else
          {
            Games.update(game._id, {$set: {gameTime: "Day",day: game.day + 1}});
            totalPlayers.forEach(function(each)
          {
            Players.update(each._id, {$set: {votes: 0,voteCast: null}});
          });
          //purge chat at the end of every phase
            chats.forEach(function(chat){
            Chat.remove(chat._id);
          });
          Games.update(game._id, {$set: {waiting: "Players",state: 'day'}});
        }
        }
      }
    }

function shuffleArray(array)
{
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

function deaths()
{
  var deaths = ['扔进水里，但是不会游泳，淹死',
  '打死',
  '割喉而死',
  '用砖块砸死',
  '强行塞20个狗不理包子噎死',
  '用三轮车撞死',
  '塞到马桶里溺死',
  '关起来饿死',
  '送进传销组织，企图逃出来的时候被打死',
  '关进基佬监狱，洗澡的时候不小心肥皂掉了。。。',
  '扔进洗衣机转死',
  '辱骂而亡',
  '用钢琴砸死',
  '陷害，被愤怒TFBoy粉丝打死',
  '一记螺旋丸击中，卒',
  '一记千鸟击中，卒',
  '一记庐山升龙霸击中，卒',
  '一记狼牙风风拳击中，卒',
  '一记元气弹击中，卒'
];
  var item = deaths[Math.floor(Math.random()*deaths.length)];
  return item;
}

function noun()
{
  var who = ['吃香蕉的',
  '跳街舞的',
  '吃麻辣烫的，',
  '大保健的，',
  '上厕所的，',
  '抠鼻屎的，',
  '打羽毛球的，',
  '看龙珠的',
  '看火影的',
  '蹲下系鞋带的',
  '玩手机的',
  '看AV的',
  '打麻将的',
  '刷牙的'
];
  var item = who[Math.floor(Math.random()*who.length)];
  return item;
}

function whois()
{
  var sowhois = ['雅木茶',
  '佟掌柜',
  '舒克',
  '兔八哥',
  '岳云鹏',
  '绿巨人',
  '雅典娜',
  '伊利丹',
  '仙道',
  '二当家',
  '杨二车纳姆',
  '法海',
  '大蛇丸',
  '阿努比斯'
];
  var item = sowhois[Math.floor(Math.random()*sowhois.length)];
  return item;
}

function locations()
{
  var locations = ['厕所',
  '广场上',
  'KTV包间',
  '家',
  '地铁上',
  '星巴克',
  '女厕所',
  '男厕所',
  '朝鲜境内',
  '迪斯尼乐园',
  '乞力马扎罗山上',
  '马里亚纳海沟',
  '撒哈拉',
  '血色修道院',
  '外域',
  '卡拉赞',
  '太阳之井',
  '终结之谷',
  '疯人院',
  '阿兹卡班',
  '木叶',
  '南斯拉夫'
];
  var item = locations[Math.floor(Math.random()*locations.length)];
  return item;
}

function verbs()
{
  var verb = ['抽烟',
  '吃饭',
  '喝咖啡',
  '看康熙来了',
  '睡觉',
  '摘蘑菇',
  '拿着水晶鞋寻找灰姑娘',
  '逃离FBI追捕',
  '看故事会',
  '玩马里奥卡丁车',
  '寻找法老的宝藏',
  '和赵灵儿去南诏国',
  '躲在石头后面偷看赵灵儿洗澡',
  '召唤九尾',
  '封印大蛇丸',
  '哭着对安西教练说［我想打篮球］',
  '集查克拉',
  '在等待CD时间',
  '在施法变羊术'
];
  var item = verb[Math.floor(Math.random()*verb.length)];
  return item;
}

function mafiaNews(playerName, healed)
{
  var death = deaths();
  var who = whois();
  var doing = noun();
  var location = locations();
  var verb = verbs();
  var game = getCurrentGame();
  if(!healed)
  {
    var reason = "昨晚 " + playerName + " 在 " + location + " " + verb +" 的时候 " + " 非常不幸的，" + "被在 " + doing + " " + who + " " + death + "。";
  }
  else
  {
    var reason = "昨晚 " + playerName + " 在 " + location + " " + verb +" 的时候 " + " 非常不幸的，" + "被在 " + doing + " " + who + " " + death + ", " + "但是在关键时刻，一道圣光，TA居然被复活了。";
  }
  Meteor.subscribe('news',game._id);
  if(game.global)
  {
    News.insert({
        name: playerName,
        summary: "被杀",
        reason: reason,
        createdAt: moment().format(), // current time
        game: Session.get("gameID"), //get gameID for chat reference
    });
  }
  else
  {
    var reason = "";
    if(healed)
    {
      reason = playerName + " 被杀手盯上了，但是医生救了TA。然后自己编个故事吧。。。"
    }
    else
    {
      reason = playerName + " 被杀手爆头了。然后自己编个故事吧。。。"
    }
    News.insert({
        name: playerName,
        summary: "被杀",
        reason: reason,
        createdAt: moment().format(), // current time
        game: Session.get("gameID"), //get gameID for chat reference
    });
  }
}

function communityNews(playerName)
{
  var game = getCurrentGame();
  Meteor.subscribe('news',game._id);
  if(game.global)
  {
    News.insert({
        name: playerName,
        summary: "被投死",
        reason: "不明真相的 " + playerName + " 被绞死了。",
        createdAt: moment().format(), // current time
        game: Session.get("gameID"), //get gameID for chat reference
        });
  }
  else
  {
     News.insert({
      name: playerName,
      summary: "被投死",
      reason: playerName + " 被投死了。",
      createdAt: moment().format(), // current time
      game: Session.get("gameID"), //get gameID for chat reference
      });
  }
}

function assignRoles(players)
{
  var game = getCurrentGame();
  var totalPlayers = players.length;
  var totalMafia = Math.floor(Math.sqrt(totalPlayers));
  var colours = ['sms_01','sms_02','sms_03','sms_04','sms_05',
  'sms_06','sms_07','sms_08','sms_09','sms_10',
  'sms_11','sms_12','sms_13','sms_14','sms_15',
  'sms_16','sms_17','sms_18','sms_19','sms_20'];

  if(game.global == false)
  {
  	GAnalytics.event("game-events", "localgame");
    var narr = 1;
  }
  else
  {
  	GAnalytics.event("game-events", "globalgame");
    var narr = 0;
  }

  if(Session.get('want_doctor'))
  {
  	GAnalytics.event("game-events", "hasdoctor");
    var totalDoctor = 1;
  }
  else
  {
    var totalDoctor = 0;
  }

  if(Session.get('want_inspec'))
  {
  	GAnalytics.event("game-events", "hasinspector");
    var totalInspector = totalMafia;
  }
  else
  {
    var totalInspector = 0;
  }

  var totalCivilian = totalPlayers - totalMafia - totalDoctor - totalInspector - narr;

  var mafia = createCustomArray("mafioso",totalMafia);
  var doctor = createCustomArray("doctor",totalDoctor);
  var narrator = createCustomArray("narrator",narr);
  var inspector = createCustomArray("inspector",totalInspector);
  var civilian = createCustomArray("civilian",totalCivilian);
  var roleList = mafia.concat(inspector,civilian,narrator,doctor);
  var role = null;
  var shuffled_roles = shuffleArray(roleList);
  players.forEach(function(player){
    role = shuffled_roles.pop();
    colour = colours.pop();
   Players.update(player._id, {$set: {role: role,colour: colour}});
 });

}
function updateScroll()
{
	if($('#chat_sms_display')[0].scrollHeight > $('#chat_sms_display').height())
	{
	  $("#chat_sms_display").animate({
	    scrollTop: $('#chat_sms_display')[0].scrollHeight
	  }, 200);
	}
}
function leave()
{
  Session.set('urlAccessCode', null);
  Session.set("gameID", null);
  Session.set("isHost", null);
  Session.set("playerID", null);
  Session.set('urlCode', "/");
  Session.set("colour", 'sms_01');
  var player = getCurrentPlayer();
  if(player){
    Players.remove(player._id);
  }
  Session.set("template_select","start_screen");
}
function kill_game()
{
  var player = getCurrentPlayer();
  Session.set('urlCode', "/");
  if (player){
    Players.remove(player._id);
  }
  location.reload();
}
function reset_user()
{
  Session.set('urlAccessCode', null);
  Session.set("gameID", null);
  Session.set("playerID", null);
  Session.set("playerName", null);
  Session.set("colour", null);
  Session.set("playerID", null);
}

  //evanbrumley Spyfall
  function hasHistoryApi () {
  return !!(window.history && window.history.pushState);
}

if (hasHistoryApi()){
  function trackUrlState()
    {
      var accessCode = null;
      var game = getCurrentGame();
      var url = window.location.pathname;

      if(url.length > 1)
      {
        var url = url.replace(/\//g,'');
        Session.set('urlCode',  url);
      }
      else
      {
        Session.set('urlCode',  null);
      }
      if (game){
        accessCode = game.accessCode;
      } else {
        accessCode = Session.get('urlAccessCode');
      }
      var currentURL = '/';
      if (accessCode){
        currentURL += accessCode+'/';
      }
      window.history.pushState(null, null, currentURL);
    }
    Tracker.autorun(trackUrlState);
  }
  Tracker.autorun(stateMachine);

  FlashMessages.configure({
  autoHide: true,
  autoScroll: false
});

/*------------------------------End Functions----------------*/


Template.main_menu.helpers({
    pageSelect: function(){
    return Session.get('template_select')
  },
});

/*--------------------------Start_screen---------------------*/

  Template.start_screen.events({
    'click #create_game': function ()
    {
      Session.set('template_select', 'create_game');
    },
    'click #join_game': function ()
    {
      Session.set('template_select', 'join_game');
    }
  });

/*--------------------------Create_Game---------------------*/
Template.create_game.helpers({
  isLoading: function() {
    return Session.get('loading');
  }
});

  Template.create_game.events({
    'click #back': function ()
    {
      Session.set('template_select', 'start_screen');
    },
    'click #submit': function (event)
    {
      event.preventDefault();
      Session.set("isHost", true);
      var playerName = $('#name').val();
      var pass = $('#pass').val();
      if(!playerName || !pass)
      {
        FlashMessages.sendInfo("哥。。。快把该填的都填上");
        return false;
      }
      pass = pass.trim();
      playerName = playerName.trim();

      var game = generateNewGame();
      var player = generateNewPlayer(game, playerName, pass);
      Meteor.subscribe('games', game.accessCode);
      Session.set("loading", true);
      GAnalytics.pageview("/" + game.accessCode);
      GAnalytics.event("game-events", "creategame");
      Meteor.subscribe('players', game._id, function onReady()
      {
        Session.set("loading", false);
        Session.set("gameID", game._id);
        Session.set("message_check", moment().format());
        Session.set("playerID", player._id);
        Session.set('want_doctor', false);
        Session.set('want_inspec', true);
        Session.set("playerName",player.name);
        Session.set("template_select", "queue_list");
    });
  }
  });

  /*--------------------------Join Game---------------------*/
  Template.join_game.helpers({
    isLoading: function() {
      return Session.get('loading');
    },
    hasUrlCode: function(){
      if(Session.get('urlCode') != "/")
      {
        return Session.get('urlCode');
      }
    }
  });

  Template.join_game.events({
    'click #back': function ()
    {
      leave();
    },
    'click #submit': function (event)
    {

      event.preventDefault();

      var accessCode = $('#accessCode').val();
      var playerName = $('#name').val();
      var pass = $('#pass').val();
      if (!playerName || !pass) {
      FlashMessages.sendInfo("哥。。。快把该填的都填上");
      return false;
    }

    accessCode = accessCode.trim();
    accessCode = accessCode.toLowerCase();

    pass = pass.trim();
    playerName = playerName.trim();

    Session.set("loading", true);

    Meteor.subscribe('games', accessCode, function onReady(){
      Session.set("loading", false);

      var game = Games.findOne({
        accessCode: accessCode
      });

      if (game)
      {

        Session.set("isHost", false);
          //if first time joining
        if(game.state == "waitingForPlayers")
        {
          Session.set("loading", true);
          Meteor.subscribe('players',game._id,  function onReady(){
          Session.set("loading", false);

          var checkForSameName = Players.find({'gameID': game._id, 'name': playerName}).fetch();
          if(checkForSameName.length > 0){
            FlashMessages.sendError("换一个名字呗，这名字已经被用了");
            GAnalytics.event("game-events", "invalid-nametaken-joingame");
            return;
          }
          var playerLimit = Players.find({'gameID': game._id}).fetch();
          if(playerLimit.length >= 20){
            FlashMessages.sendError("下次早点来，房间装不下了");
            GAnalytics.event("game-events", "invalid-gamefull-joingame");
            return;
          }
          GAnalytics.pageview("/" + accessCode);
          GAnalytics.event("game-events", "new-joingame");
          player = generateNewPlayer(game, playerName, pass);
          Session.set('urlAccessCode', null);
          Session.set("gameID", game._id);
          Session.set("message_check", moment().format());
          Session.set("playerID", player._id);
          Session.set("playerName",player.name);
          Meteor.subscribe('news',game._id);
          });
        }
        else
          //if game in progress
        {
            Session.set("loading", true);
            Meteor.subscribe('players', game._id, function onReady()
        	{
	            Session.set("loading", false);
	            var oldPlayer = Players.findOne({'gameID': game._id,'name': playerName,'pass': pass}, {});
	            if(oldPlayer)
	            {
                GAnalytics.pageview("/" + accessCode);
	            	GAnalytics.event("game-events", "rejoin-joingame");
	                Session.set('urlAccessCode', null);
	                Session.set("gameID", game._id);
	                Session.set("playerID", oldPlayer._id);
	                Session.set("message_check", moment().format());
	                Session.set("playerName",oldPlayer.name);
	                Meteor.subscribe('news',game._id);
	            }
	            else
	            {
	            	GAnalytics.event("game-events", "invalid-rejoin-joingame");
	                FlashMessages.sendError("大哥，要不是你打错字了，否则就是游戏已经开始所以进不去了");
	                Session.set("loading", false);
	            }
          });
        }
      }
      else
      {
        Session.set("loading", false);
        GAnalytics.event("game-events", "invalid-code-joingame");
        FlashMessages.sendError("invalid access code");
      }
    });
    }
    //end event
  });

  /*--------------------------Queue---------------------*/
  Template.queue_list.helpers({
    game: function(){
      return getCurrentGame();
    },
    player: function(){
      return getCurrentPlayer();
    },
    isLoading: function() {
      return Session.get('loading');
    },
    global: function(){
      var game = getCurrentGame();
      return game.global;
    },
    isHost: function(){
      if(Session.get('isHost'))
      {
        return true;
      }
      else
      {
        return false;
      }
    },
    //disable the game from starting if to little players
    minPlayer: function(){
      var game = getCurrentGame();
      var players = Players.find({'gameID': game._id}, {}).fetch();
      if(game.global)
      {
        if(players.length >= 6)
        {
          return "enabled";
        }
        else
        {
          return "disabled";
        }
      }
      else
      {
          if(players.length >= 7)
        {
          return "enabled";
        }
        else
        {
          return "disabled";
        }
      }
    },
    players: function(){
      var game = getCurrentGame();
      var currentPlayer = getCurrentPlayer();

      if (!game) {
        return null;
      }
      var players = Players.find({'gameID': game._id}, {'sort': {'createdAt': 1}}).fetch();

      players.forEach(function(player){
        if (player._id === currentPlayer._id){
            Players.update(player._id, {$set: {isCurrent: true}});
        }
        if(player.role == "mafioso")
          {
            Players.update(player._id, {$set: {isMafia: true}});
          }
        if(player.role == "narrator")
          {
            Players.update(player._id, {$set: {isNarrator: true}});
          }
      });
      return players;
    },
    accessLink: function ()
    {
      return getAccessLink();
    },
    urlCode: function()
    {
      return urlLink();
    }
  });

Template.queue_list.events({
    'click #leave': function ()
    {
      leave();
    },
    'click .remove': function (event)
    {
      if(Session.get('isHost')){
        var player = getCurrentPlayer();
        var removePlayer = event.target.id;
        if(removePlayer !== player._id)
        {
          Players.remove(removePlayer);
        }
      }
    },
    'change #global' : function (){
       Games.update(Session.get("gameID"), {$set: {global: true}});
   },
   'change #local' : function (){
       Games.update(Session.get("gameID"), {$set: {global: false}});
   },
   'change #doc_on' : function(){
      Session.set('want_doctor', true);
   },
   'change #doc_off' : function(){
      Session.set('want_doctor', false);
   },
   'change #ins_on' : function(){
      Session.set('want_inspec', true);
   },
   'change #ins_off' : function(){
      Session.set('want_inspec', false);
   },
    'click #start-game': function ()
    {
      var game = getCurrentGame();
      var players = Players.find({'gameID': game._id}, {'sort': {'createdAt': 1}}).fetch();
      assignRoles(players);
      Games.update(game._id, {$set: {state: 'day'}});
    },
});

/*--------------------------Day---------------------*/
  Template.day.helpers({
    time: function(){
      var game = getCurrentGame();
      var t = '';
      if(game.gameTime == 'Day'){
        t='个白天';
      }else if(game.gameTime == 'Night'){
        t='个晚上';
      }else{
        t='!BUG!';
      }
      var dayString = "第 " + game.day.toString() + " " + t;

      return dayString;
    },
    //briefing
    role: function(){
      var role = getCurrentPlayer();
      var rt="";
      if(role.role == 'civilian'){
        rt='无辜群众';
      }else if(role.role == 'mafioso'){
        rt='杀手';
      }else if(role.role == 'narrator'){
        rt='主持';
      }else if(role.role == 'inspector'){
        rt='警察';
      }else if(role.role == 'doctor'){
        rt='医生'
      }
      return rt;
    },
    check_votes: function(){
    	var checkvote = Session.get('check_votes');
    	return Players.find({'gameID': Session.get("gameID"), 'voteCast':checkvote}, {}).fetch();
    },
    isMobile: function(){
     if(window.innerWidth < 994){
         return true;
      }
      else{
        return false;
      }
    },
    myName: function(){
      var role = getCurrentPlayer();
      return role.name;
    },
    isMafia: function(){
      var player = getCurrentPlayer();
      return player.isMafia;
    },
    isInspector: function(){
      var player = getCurrentPlayer();
      if(player.role == 'inspector'){
        return true;
      }else{
        return false;
      }
    },
    //update chat scroll
    updateScroll: function(){
        updateScroll();
    },

    //Display roles description
    roleDescription: function(){
      var player = getCurrentPlayer();
      if(player.role === 'mafioso')
      {
        return "白天你要尽可能不要被投票投出去。到了晚上，你的目标是和别的杀手一起把其他人都杀掉。";
      }
      else if(player.role === 'civilian')
      {
        return "白天你要和别的不明真相的群众想办法把有杀手嫌疑的人投出去，你们需要过半的选票。到了晚上，你就只有祈祷不被杀掉了。";
      }
      else if(player.role === 'narrator')
      {
        return "你负责引导整体游戏流程。";
      }
      else if(player.role === 'inspector')
      {
        return "晚上你可以鉴别一个角色是不是杀手。";
      }
      else if(player.role === 'doctor')
      {
        return "晚上你可以拯救一个角色，让他免于杀手的毒手，当然包括你自己。"
      }
    },
    //if there is a narrator
    global: function(){
      var game = getCurrentGame();
      var player = getCurrentPlayer();

      if(!game.global)
      {
        if(player.isNarrator == true)
        {
          return true;
        }
        else
        {
          return false;
        }
      }
      else
      {
        return true;
      }
    },
    //global boolean
    enabled: function(){
      var game = getCurrentGame();
      return game.global;
    },
    //visiblity per player role
    access: function(){
      var game = getCurrentGame();
      var player = getCurrentPlayer();
      if(game.state == "day")
      {
        return true;
      }
      else if(game.state == "night" && player.isMafia == true)
      {
        return true;
      }
      else if(game.state == "night" && player.isMafia == false)
      {
        return false;
      }
      else if(game.state == "inspection" && player.role == "inspector")
      {
        return true;
      }
      else if(game.state == "inspection" && player.role != "inspector")
      {
        return false;
      }
      else if(game.state == "medic" && player.role == "doctor")
      {
        return true;
      }
      else if(game.state == "medic" && player.role != "doctor")
      {
        return false;
      }
      else
      {
        return false;
      }
    },

    //display icon if new messages in chat
    messageNotification: function(){
      var chat_messages = Chat.find({'game': Session.get("gameID"), createdAt: {$gt: Session.get("message_check")}}, {}).fetch();
      if(chat_messages.length > 0)
      {
        return true;
      }
      else
      {
        return false;
      }
    },
    //all mafia
    otherMafia: function(){
      var players = Players.find({'gameID': Session.get("gameID"),'isMafia':true}, {}).fetch();
      return players;
    },
    otherInspector: function(){
      var players = Players.find({'gameID': Session.get("gameID"),'role':'inspector'}, {}).fetch();
      return players;
    },

    //Who players are waiting for
    waiting: function(){
      var game = getCurrentGame();
      var player = getCurrentPlayer();
      if(game.waiting == 'Mafia' && player.isMafia == true)
      {
        return "你！";
      }
      else if (game.waiting == 'Doctor' && player.role == 'doctor')
      {
        return "你！";
      }
      else if (game.waiting == "Inspector" && player.role == 'inspector')
      {
        return "你！";
      }
      else if (game.waiting == "Players")
      {
        return "所有人，现在是投票时间！";
      }
      else
      {
        var char = "";
        if(game.waiting == 'Mafia'){
          char = "杀手";
        }else if(game.waiting == 'Doctor'){
          char = "医生";
        }else if(game.waiting == 'Inspector'){
          char = "警察";
        }else{
          char = "!BUG!";
        }
        return char;
      }

    },

    //is player is alive function
    isAlive: function(){
      var alive = getCurrentPlayer();
      return alive.alive;
    },
    //----------------------------------//
    //Display current players in game
    //----------------------------------//
    civilians: function(){
      var Civilians = Players.find({'gameID': Session.get("gameID"),'role':'civilian'}, {}).fetch();
      return Civilians.length;
    },
    mafioso: function(){
      var mafioso = Players.find({'gameID': Session.get("gameID"),'isMafia':true}, {}).fetch();
      return mafioso.length;
    },
    inspector: function(){
      var inspect = Players.find({'gameID': Session.get("gameID"),'role':'inspector'}, {}).fetch();
      if(inspect.length > 0)
      {
        return inspect.length;
      }
      else
      {
        return false;
      }
    },
    doctor: function(){
      var doctor = Players.find({'gameID': Session.get("gameID"),'role':'doctor'}, {}).fetch();
      if(doctor.length > 0)
      {
        return true;
      }
      else
      {
        return false;
      }
    },
    //----------------------------------//

    players: function(){
      var players = Players.find({'gameID': Session.get("gameID"), 'isNarrator':false}, {'sort': {'votes': -1}}).fetch();
      return players;
    },
    //chat
    chat: function(){
      return Chat.find({"game":Session.get("gameID")}, {sort: {createdAt: +1}});
    },
    news: function(){
      return News.find({"game":Session.get("gameID")}, {sort: {createdAt: -1}});
    },
    isInspector: function(){
      var player = getCurrentPlayer();
      if(player.role == "inspector")
      {
        return true;
      }
      else
      {
        return false;
      }
    },
  });

  Template.day.events({
    //voting
    'click .whoVoted' :function(event){
    	var playerID = event.target.id;
    	Session.set('check_votes', playerID);
    },
    'click .vote' :function(event){
      var myVote = event.target.id;
      var votedPlayer = getVotedPlayer(myVote);
      var player = getCurrentPlayer();
      var game = getCurrentGame();
      //day and night votes
      if(game.state == "day" || game.state == "night")
      {
        if(player.alive == false || player.role == "narrator" || player.voteCast === myVote || votedPlayer.alive == false || votedPlayer.role == "narrator")
        {
          // don't vote for yourself dummy
        }
        else if(player.voteCast == null)
        {
          //initialize vote
        Players.update(player._id, {$set: {voteCast: myVote}});
        Session.set('myVote', myVote);
        //store vote as session variable to negate it later on
        Players.update(votedPlayer._id, {$set: {votes: votedPlayer.votes + 1}});
        }
        else if(player.voteCast !== myVote)
        {
          //player changes vote//
          //negate last vote
          var lastVote = getVotedPlayer(Session.get('myVote'));
          Players.update(Session.get('myVote'), {$set: {votes: lastVote.votes -1}});
          Session.set('myVote', myVote);

          // add new vote
          Players.update(votedPlayer._id, {$set: {votes: votedPlayer.votes + 1}});
          Players.update(player._id, {$set: {voteCast: myVote}});
        }
      }

      //special phases votes
      else if(game.state == "inspection")
      {
        if(myVote == player._id || player.alive == false || player.voteCast === myVote || votedPlayer.alive == false || votedPlayer.role == "narrator")
        {
          // don't vote for yourself dummy
        }
        else
        {
          var r = '';
          if(votedPlayer.role == 'mafioso'){
            r = '确实是杀手';
          }else{
            r = '不是杀手';
          }
          alert(votedPlayer.name + " | " + r);
          var isDoctorAlive = Players.find({'gameID': game._id,  'alive': true, 'role': 'doctor'},{}).fetch();
          if(isDoctorAlive.length == 0)
          {
            Games.update(game._id, {$set: {waiting: "Mafia",state: 'night'}});
          }
          else
          {
            Games.update(game._id, {$set: {waiting: "Doctor",state: 'medic'}});
          }
        }
      }

      else if(game.state == "medic")
      {
        if(player.alive == false || player.voteCast === myVote || votedPlayer.alive == false || votedPlayer.role == "narrator")
        {
          // don't vote for yourself dummy
        }
        else
        {
          alert("保护了" + votedPlayer.name);
          Players.update(votedPlayer._id, {$set: {healed: true}});
          Games.update(game._id, {$set: {waiting: "Mafia",state: 'night'}});
        }
      }
      //add more role phases here via else if
      checkVotes(game.state);
    },

    //chat
    "submit .new-message": function (event) {
      // Prevent default browser form submit
      event.preventDefault();
      var player = getCurrentPlayer();
      var text = event.target.text.value;
      if(text == null || text == "" || text == " ")
      {
        return false;
      }
      Chat.insert({
        text: text,
        createdAt: moment().format(), // current time
        game: Session.get("gameID"), //get gameID for chat reference
        owner: Session.get("playerID"),  // _id of user
        colour: player.colour,
        username: Session.get("playerName")  // username of user
      });
      updateScroll();
      Session.set("message_check", moment().format());
      // Clear form
      event.target.text.value = "";
      }
  });

  Template.game_over.helpers({
    players: function(){
      var players = Players.find({'gameID': Session.get("gameID")}, {'sort': {'name': -1}}).fetch();
      return players;
    },
    winner: function(){
      var winner = getCurrentGame();
      var rt = "";
      if(winner.winner == 'The Mafia'){
        rt = '杀手们';
      }else if(winner.winner == 'Civilians'){
        rt = '群众们';
      }else{
        rt = '!BUG!';
      }
      return rt;
    },
    isMa:function(mafia){
      if(mafia)
      {
        return true;
      }
      else
      {
        return false;
      }
    },
    isAlive: function(alive){
      if(alive)
      {
        return true;
      }
      else
      {
        return false;
      }
    },
    special: function(){
      var game = getCurrentGame();
      return game.special;
    }
  });

/*--------------------------Renders---------------------*/
  Template.start_screen.rendered = function(){
  	GAnalytics.pageview("/");
  };

  Template.queue_list.rendered = function(){
    $(document).ready(function(){
    $('[data-toggle="tooltip"]').tooltip({placement:'right'});
    });
  };

  Template.day.rendered = function(){
    $('.nav-tabs a:first').tab('show');

    var game = getCurrentGame();
    var scrolled = false;
    var heights = window.innerHeight;
    var row_H = $('.row').height();
    var smsField_H = $('.new-message').height();
    var shown_tab = false;

    if(window.innerWidth < 994)
    {
      document.getElementById("chat_sms_display").style.height = heights - row_H - 30 + "px";
    }
    else
    {
    document.getElementById("chat_sms_display").style.height = heights * .55  + "px";
    }

    if(game.global)
    {
    setInterval(function(){
      if(shown_tab){
      var divHeight = $('#chat_sms_display').height();
      var scrollHeight = $('#chat_sms_display').prop('scrollHeight');
      var scrolledpx = parseInt($("#chat_sms_display").scrollTop());
      if(($("#chat_sms_display").scrollTop()+divHeight) > (scrollHeight-150)) {
          Session.set("message_check", moment().format());
          updateScroll();
        }else{
          //do nothing
        }
      }
    },500);
  }
    window.onresize = function(event) {
      var heights = window.innerHeight;
      var row_H = $('.row').height();
      var smsField_H = $('.new-message').height();
      if(window.innerWidth < 994)
      {
        document.getElementById("chat_sms_display").style.height = heights - row_H + "px";
      }
      else
      {
        document.getElementById("chat_sms_display").style.height = heights * .55 + "px";
      }
    }

    $('a[update-time="up"]').on('shown.bs.tab', function (e) {
      shown_tab = true;
      Session.set("message_check", moment().format());
      updateScroll();
    });

    $('a[update-time="down"]').on('shown.bs.tab', function (e) {
      shown_tab = false;
    });

    var game = getCurrentGame();
    Meteor.subscribe('chat',game._id);
    $('.nav-tabs a').click(function(){
        $(this).tab('show');
    });

    $(document).ready(function(){
      $('[data-toggle="tooltip"]').tooltip({placement:'right'});
    });
  };

  Template.game_over.rendered = function(){
    window.setTimeout(kill_game, 60000);
  };

  Template.join_game.rendered = function(){
    GAnalytics.pageview("/");
    $('input[type=text][name=name]').tooltip({
    placement: "top",
    trigger: "focus"
  });
      $('input[type=text][name=pass]').tooltip({
    placement: "bottom",
    trigger: "focus"
  });
  };

  Template.start_screen.rendered = function()
    {
      if(Session.get('urlCode') != null)
      {
        if(Session.get('urlCode').length > 2)
        {
          Session.set('template_select', 'join_game');
        }
      }
    };

  Template.create_game.rendered = function(){

    $('input[type=text][name=name]').tooltip({
    placement: "top",
    trigger: "focus"
  });
      $('input[type=password][name=pass]').tooltip({
    placement: "bottom",
    trigger: "focus"
  });
  };

  Template.join_game.rendered = function(){

    $('input[type=text][name=name]').tooltip({
    placement: "top",
    trigger: "focus"
  });
      $('input[type=password][name=pass]').tooltip({
    placement: "bottom",
    trigger: "focus"
  });
  };
