/**
 * 短信信息管理<BR>
 * ------------------------------------------<BR>
 * <BR>
 * Copyright© : 2015 by Dick<BR>
 * Author : Dick <BR>
 * Date : 2015年10月28日 <BR>
 * Description :<BR>
 * <p>
 *
 * </p>
 */
var logger = require('../resources/logConf').getLogger("smsService");
var Common = require('../util/common');
var Request = require('request');
var config = require('../resources/config');
var SmsInfo = require('../models/smsInfo.js');
var SmsConfig = require('../models/smsConfig.js');
var APIUtil = require('../util/APIUtil'); 	 	            //引入API工具类js
var ObjectId = require('mongoose').Types.ObjectId;

var smsService = {
    /**
     * 发送短信
     * @param smsPara {{type,useType,mobilePhone,deviceKey,content}}
     * @param withCheck  //是否需要校验，后台重发短信不需要校验
     * @param callback
     */
    send : function(smsPara, withCheck, callback){
        //查询配置
        APIUtil.DBFindOne(SmsConfig, {
                query : {
                    type : smsPara.type,
                    useType : smsPara.useType,
                    isDeleted : 1
                }
            }, function(err, smsConfig){
                if(err){
                    logger.error("<<send:查询短信配置信息出错，[errMessage:%s]", err);
                    callback(APIUtil.APIResult(err, null, null));
                    return;
                }

                //有效时长
                smsPara.validTime = 0;
                if(smsPara.type === "AUTH_CODE"){
                    if(!smsConfig || smsConfig.validTime <= 0){
                        //默认一天
                        smsPara.validTime = 86400000;
                    }else{
                        smsPara.validTime = smsConfig.validTime;
                    }
                }

                //验证次数
                if(withCheck){
                    smsService.checkSend({
                        type : smsPara.type,
                        useType : smsPara.useType,
                        mobilePhone : smsPara.mobilePhone,
                        deviceKey : smsPara.deviceKey
                    }, smsConfig, function(err, isPass){
                        if(err){
                            callback(APIUtil.APIResult(err, null, null));
                            return;
                        }
                        if(!isPass){
                            callback(APIUtil.APIResult("code_1005", null, null));
                            return;
                        }
                        //发送短信
                        smsService.doSend(smsPara, function(err){
                            if(err){
                                callback(APIUtil.APIResult(err, null, null));
                                return;
                            }
                            callback(APIUtil.APIResult(null, smsPara.content, null));
                        });
                    });
                }else{
                    //发送短信
                    smsService.doSend(smsPara, function(err){
                        if(err){
                            callback(APIUtil.APIResult(err, null, null));
                            return;
                        }
                        callback(APIUtil.APIResult(null, smsPara.content, null));
                    });
                }
            }
        );
    },

    /**
     * 发送短信
     * @param smsPara {{type,useType,mobilePhone,deviceKey,content,validTime}}
     * @param callback
     */
    doSend : function(smsPara, callback){
        var loc_currDate = new Date();
        var loc_smsInfo = {
            _id : new ObjectId(),
            type : smsPara.type,
            useType : smsPara.useType,
            mobilePhone : smsPara.mobilePhone,
            deviceKey : smsPara.deviceKey,
            content : smsPara.content,
            status : 0,
            cntFlag : 1,
            sendTime : loc_currDate,
            validUntil : null,
            useTime : null
        };
        if(smsPara.validTime > 0){
            loc_smsInfo.validUntil = new Date(loc_currDate.getTime() + smsPara.validTime);
        }
        var smsUrl = null;
        if(/^fxstudio/.test(smsPara.useType)){ //FX发送短信
            var smsCfg = config.smsCfgFX;
            var timestamp = new Date().getTime();
            Request.post(smsCfg.url, function(error, response, data){
                var loc_result = null;
                if (!error && response.statusCode == 200 && Common.isValid(data)) {
                    try{
                        data = JSON.parse(data);
                        if(data.code == "SUCCESS" && data.result && data.result.code == "OK"){
                            loc_smsInfo.status = 1;
                        }else{
                            logger.error("smsAPI[" + smsCfg.url + "]->sendSms has error:" + (data.result && data.result.result));
                            loc_result = new Error("发送短信失败:" + (data.result && data.result.result));
                            loc_smsInfo.status = 2;
                        }
                    }catch(e){
                        logger.error("smsAPI[" + smsCfg.url + "]->sendSms has error:" + e);
                        loc_result = new Error("发送短信失败！");
                        loc_smsInfo.status = 2;
                    }

                } else {
                    logger.error("smsAPI[" + smsCfg.url + "]->sendSms has error:" + error);
                    loc_result = new Error("发送短信失败！");
                    loc_smsInfo.status = 2;
                }
                //保存短信发送记录信息
                smsService.saveSmsInfo(loc_smsInfo, function(){
                    callback(loc_result);
                });
            }).form({
                userId : smsCfg.userId,
                type : smsCfg.type,
                phone : smsPara.mobilePhone,
                content : smsPara.content,
                timestamp : timestamp,
                signature : Common.getMD5(smsPara.content + "&" + smsPara.mobilePhone + "&" + timestamp + "&" + smsCfg.type + "&" + smsCfg.userId + "&" + smsCfg.userKey)
            });
        }else{ //PM发送短信
            smsUrl = config.smsUrl;
            if (smsPara.type === "AUTH_CODE") {
                smsUrl = smsUrl + "/sms_send.ucs?type=AUTH_CODE" + "&PHONE=" + smsPara.mobilePhone + "&CODE=" + smsPara.content;
            } else {    //如果传入内容，则按内容输出
                smsUrl = smsUrl + "/sms_send_common.ucs?phone=" + smsPara.mobilePhone + "&content=" + smsPara.content;
            }
            Request(smsUrl, function (error, response, data) {
                var loc_result = null;
                if (!error && response.statusCode == 200 && Common.isValid(data)) {
                    loc_smsInfo.status = 1;
                } else {
                    logger.error("smsAPI[" + smsUrl + "]->sendSms has error:" + error);
                    loc_result = new Error("发送短信失败！");
                    loc_smsInfo.status = 2;
                }
                //保存短信发送记录信息
                smsService.saveSmsInfo(loc_smsInfo, function(){
                    callback(loc_result);
                });
            });
        }
    },

    /**
     * 保存短信信息（验证码）
     * @param smsInfo
     * @param callback
     */
    saveSmsInfo : function(smsInfo, callback){
        new SmsInfo(smsInfo).save(function(err){
            if (err) {
                //保存信息失败，不影响短信发送，仅打印错误日志。
                logger.error("保存短信记录错误, smsInfo=[" + JSON.stringify(smsInfo) + "] error：" + err);
            }

            //如果是验证码，并且发送成功，需要将同一个手机号、同类型、同应用点之前发送成功的验证码设置失效
            if(smsInfo.type === "AUTH_CODE" && smsInfo.status == 1){
                SmsInfo.update({
                    _id : {$ne : smsInfo._id},
                    type : smsInfo.type,
                    useType : smsInfo.useType,
                    mobilePhone : smsInfo.mobilePhone,
                    status : 1
                },{
                    $set : {status : 4}
                },{
                    multi : true
                }, function(err){
                    if (err) {
                        //更新短信状态错误失败，不影响短信发送，仅打印错误日志。
                        logger.error("更新短信状态错误, smsInfo=[" + JSON.stringify(smsInfo) + "] error：" + error);
                    }
                    callback();
                });
            }else{
                callback();
            }
        });
    },

    /**
     * 检查是否允许发送短信
     * @param smsInfoObj {{type,useType,mobilePhone,deviceKey}}
     * @param smsConfig
     * @param callback (isPass:boolean)
     */
    checkSend : function(smsInfoObj, smsConfig, callback){
        if(!smsConfig || smsConfig.status !== 1 || smsConfig.cnt < 0){
            callback(null, true);
            return;
        }
        var loc_startDate = smsService.getStartByCycle(new Date(), smsConfig.cycle);
        var loc_query = {
            cntFlag : 1,
            type : smsInfoObj.type,
            useType : smsInfoObj.useType,
            sendTime : {$gte : loc_startDate}
        };
        if(smsInfoObj.deviceKey){
            loc_query["$or"] = [
                {mobilePhone : smsInfoObj.mobilePhone},
                {deviceKey   : smsInfoObj.deviceKey}
            ];
        }else{
            loc_query.mobilePhone = smsInfoObj.mobilePhone;
        }
        APIUtil.DBFind(SmsInfo, {
            query : loc_query,
            fieldIn: ["mobilePhone", "deviceKey"]
        }, function(err, smsInfos){
            if(err){
                logger.error("<<checkSend:统计发送数量出错，", err);
                callback(err, false);
                return;
            }
            var loc_cntMobile = 0;
            var i, lenI = !smsInfos ? 0 : smsInfos.length;
            for(i = 0; i < lenI; i++){
                if(smsInfos[i].mobilePhone == smsInfoObj.mobilePhone){
                    loc_cntMobile++;
                }
            }
            //手机号数量限制
            if(loc_cntMobile >= smsConfig.cnt){
                callback(null, false);
                return;
            }
            if(smsInfoObj.deviceKey){
                var loc_cntDeviceKey = 0;
                for(i = 0; i < lenI; i++){
                    if(smsInfos[i].deviceKey == smsInfoObj.deviceKey){
                        loc_cntDeviceKey ++;
                    }
                }
                //设备KEY值数量限制
                if(loc_cntDeviceKey >= smsConfig.cnt){
                    callback(null, false);
                    return;
                }
            }
            callback(null, true);
        });
    },

    /**
     * 重发短信
     * @param smsId
     * @param callback
     */
    resend : function(smsId, callback){
        SmsInfo.findById(smsId ,function (err, smsInfo) {
            if(err || !smsInfo){
                err = err || new Error("短信信息为空！");
                logger.error("重发短信失败：查询短信信息失败！", err);
                callback(APIUtil.APIResult(err, null, null));
                return;
            }
            var loc_validTime = 0;
            if(smsInfo.type === "AUTH_CODE"){
                if(smsInfo.validUntil instanceof Date && smsInfo.sendTime instanceof Date){
                    loc_validTime = smsInfo.validUntil.getTime() - smsInfo.sendTime.getTime();
                }else{
                    loc_validTime = 86400000; //24 * 60 * 60 * 1000
                }
            }
            var loc_smsParam = {
                type : smsInfo.type,
                useType : smsInfo.useType,
                mobilePhone : smsInfo.mobilePhone,
                deviceKey : smsInfo.deviceKey,
                content : smsInfo.content,
                validTime : loc_validTime
            };
            //发送短信
            smsService.send(loc_smsParam, false, callback);
        });
    },

    /**
     * 校验短信验证码
     * @param mobilePhone
     * @param authCode
     * @param useType
     * @param callback
     */
    checkAuth : function(mobilePhone, authCode, useType, callback){
        APIUtil.DBFindOne(SmsInfo, {query : {
            type : "AUTH_CODE",
            useType : useType,
            mobilePhone : mobilePhone,
            content : authCode,
            validUntil : {$gte : new Date()}
        }}, function(err, smsInfo){
            if(err){
                logger.error("查询验证码信息失败！", err);
                callback(APIUtil.APIResult(err, null, null));
                return;
            }
            if(!smsInfo){
                //验证失败
                callback(APIUtil.APIResult(null, false, null));
                return;
            }
            if(smsInfo.status === 1){
                smsInfo.update({
                    $set : {
                        status : 3,
                        useTime: new Date()
                    }
                }, function(err){
                    if(err){
                        //更新验证码状态失败，不影响验证码校验，仅打印错误日志。
                        logger.error("更新验证码状态失败, smsInfo=[" + JSON.stringify(smsInfo) + "] error：" + error);
                    }
                    callback(APIUtil.APIResult(null, true, null));
                });
            }else if(smsInfo.status === 2){
                callback(APIUtil.APIResult(null, true, null));
            }else if(smsInfo.status === 3){
                callback(APIUtil.APIResult("code_1006", false, null));
            }else if(smsInfo.status === 4){
                callback(APIUtil.APIResult("code_1007", false, null));
            }else{
                callback(APIUtil.APIResult(null, false, null));
            }
        });
    },

    /**
     * 获取当前周期起始时间
     * @param date
     * @param cycle
     */
    getStartByCycle : function(date, cycle){
        if(cycle === "H"){
            date.setMinutes(0, 0, 0);
        }else if(cycle === "D"){
            date.setHours(0, 0, 0, 0);
        }else if(cycle === "W"){
            date.setHours(0, 0, 0, 0);
            var loc_day = date.getDay();
            date.setTime(date.getTime() - loc_day * 24 * 60 * 60 * 1000);
        }else if(cycle === "M"){
            date.setDate(1);
            date.setHours(0, 0, 0, 0);
        }else if(cycle === "Y"){
            date.setMonth(0, 1);
            date.setHours(0, 0, 0, 0);
        }
        return date;
    }
};

//导出服务类
module.exports =smsService;