const Botkit = require('botkit');
const CronJob = require('cron').CronJob;
const fs = require('fs');

if (!process.env.token) {
  console.log('Error: Specify token in environment');
  process.exit(1);
}

const controller = Botkit.slackbot({
    debug: false,
    json_file_store: 'storage_bot_db'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM(function(err, bot, payload){
    if (err) {
        throw new Error(err);
    }
    //お天気の通知
    new CronJob({
      cronTime: '* 7 * * ',
      onTick: function() {
        var url = 'http://api.openweathermap.org/data/2.5/weather?units=metric&q=Tokyo,jp&appid=9e3c4385a9b267abf38a1189d7e8047b';
        var request = require('request');
        var reply_message = '';
        var test = request( url, function(error, response, body) {
          if( !error && response.statusCode == 200){
            var json = JSON.parse(body);
            var weather = json['weather'][0];
            var iconId = weather['icon'];
            var cityName = json['name'];
            var main = json['main'];
            var temp = main['temp'];
            var reply_message = '今日の' + cityName + 'の天気は' + weather['main'] + '\n';
            reply_message += '現在の気温は' + main['temp'] + '℃\n';
            reply_message += '最高気温は' + main['temp_max'] + '℃\n';
            reply_message += '最低気温は' + main['temp_min'] + '℃\n';
            reply_message += '<http://openweathermap.org/img/w/' + iconId + '.png | > \n';

            bot.say({
              channel: 'random',
              text: reply_message,
              username: 'fbot',
              icon_url: ''
            });
          }
        });
      },
      start: true,
      timeZone: 'Asia/Tokyo'
    })
});

// say hi（サンプル）
controller.hears('hi',['direct_message','direct_mention','mention'],function(bot,message) {
    bot.reply(message,'hi');
});

//名前記憶（サンプル）
controller.hears(['きみの名前', 'あなたは誰'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, '私は' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('まだ名前がないです。');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});
//名前記憶（サンプル）
controller.hears(['(.*)って呼んで', '君の名前は(.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }

        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'わかりました。私は' + user.name + 'です。');
        });
    });
});

//メモする
controller.hears(['memo (.*)','憶えて (.*)'], 'direct_message,direct_mention,mention', function(bot, message)
{
  var item = message.match[1];
  controller.storage.channels.get(message.user, function(err, channel_data){
    if(channel_data && channel_data.name){
      var name_arr = channel_data.name.split(',');
      name_arr.push(item);
      channel_data = {
        id : message.user,
        name : name_arr.join(',')
      }
    } else {
      channel_data = {
        id: message.user,
        name: item
      };
    }
    controller.storage.channels.save(channel_data, function(err, id){
       bot.reply(message, item + '覚えました！');
    });
  });
});

//一つずつ削除
controller.hears(['d (.*)','削除 (.*)'], 'direct_message,direct_mention,mention', function(bot, message)
{
  var item = message.match[1];
  controller.storage.channels.get(message.user, function(err, channel_data){
    if(channel_data && channel_data.name){
      var name_arr = channel_data.name.split(',');
      if(name_arr.indexOf(item) >= 0){
        var new_arr = name_arr.filter(function(a){
          return a !== item;
        });
        channel_data = {
          id : message.user,
          name : new_arr.join(',')
        };
        controller.storage.channels.save(channel_data, function(err, id){
          bot.reply(message, item + '忘れました。');
        });
      } else {
        bot.reply(message, 'それは覚えていないです。');
      }
    }
  });
});

//メモリーディング
controller.hears(['ta','教えて'], 'direct_message,direct_mention,mention', function(bot, message)
{
  controller.storage.channels.get(message.user, function(err, channel_data){
    if(channel_data && channel_data.name){
      var name_arr = channel_data.name.split(',');
      bot.reply(message, 'こちらになります。');
      for(var i=0; i < name_arr.length; i++){
        bot.reply(message, name_arr[i]);
      }
    } else {
      bot.reply(message, '何も覚えていません。。');
    }
  });
});

//すべてのメモを削除
controller.hears(['da','全て削除'], 'direct_message,direct_mention,mention', function(bot, message)
{
  controller.storage.channels.get(message.user, function(err, channel_data){
    channel_data = {
      id: message.user
    };
    controller.storage.channels.save(channel_data, function(err, id){
      bot.reply(message, 'すべて忘れました。');
    });
  });
});

//お天気
controller.hears('今日の天気',['direct_message','direct_mention','mention'],function(bot,message) {
    var url = 'http://api.openweathermap.org/data/2.5/weather?units=metric&q=Tokyo,jp&appid=9e3c4385a9b267abf38a1189d7e8047b';
    var request = require('request');
    request( url, function(error, response, body) {
      if( !error && response.statusCode == 200){
        var json = JSON.parse(body);
        var weather = json['weather'][0];
        var iconId = weather['icon'];
        var cityName = json['name'];
        var main = json['main'];
        var temp = main['temp'];
        var reply_message = '今日の' + cityName + 'の天気は' + weather['main'] + '\n';
        reply_message += '現在の気温は' + main['temp'] + '℃\n';
        reply_message += '最高気温は' + main['temp_max'] + '℃\n';
        reply_message += '最低気温は' + main['temp_min'] + '℃\n';
        reply_message += '<http://openweathermap.org/img/w/' + iconId + '.png | > \n';
        bot.reply( message, reply_message);

      }
    });
});
