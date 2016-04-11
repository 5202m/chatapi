/**
 * 财经数据API服务类<BR>
 * ------------------------------------------<BR>
 * <BR>
 * Copyright© : 2016 by Dick<BR>
 * Author : Dick <BR>
 * Date : 2016年03月25日 <BR>
 * Description :<BR>
 * <p>
 *  财经日历 + 假期预告 + 财经大事
 * </p>
 */
var Logger = require('../resources/logConf').getLogger("zxFinanceService");
var ZxFinanceDataCfg = require('../models/zxFinanceDataCfg.js');
var ZxFinanceData = require('../models/zxFinanceData.js');
var ZxFinanceEvent = require('../models/zxFinanceEvent.js');
var Async = require('async');//引入async
var APIUtil = require('../util/APIUtil'); 	 	            //引入API工具类js
var Request = require('request');
var Config=require('../resources/config.js');
var Utils = require('../util/Utils');
var Common = require('../util/common');

var zxFinanceService = {
    /**
     * 获取财经数据列表
     * @param date 数据日期
     * @param dataType 数据类型 1-外汇 2-贵金属
     * @param callback (err, datas)
     */
    getDataList : function(date, dataType, callback){
        var loc_query = {
            date : date,
            valid : 1
        };
        if(dataType==1){
            loc_query.dataType = {$in : [0,1]}
        }else if(dataType==2){
            loc_query.dataType = {$in : [0,2]}
        }
        APIUtil.DBFind(ZxFinanceData, {
            query : loc_query,
            sortAsc : ["time", "country"]
        }, function(err, datas){
            if(err){
                Logger.error("<<getDataList:查询财经日历信息出错，[errMessage:%s]", err);
                callback(null, null);
                return;
            }
            callback(null, datas);
        });
    },

    /**
     * 获取财经事件列表（查询当天的财经事件，和未来四天的假日预告）
     * @param date 数据日期
     * @param dataType 数据类型 1-外汇 2-贵金属
     * @param callback (err, events)
     */
    getEventList : function(date, dataType, callback){
        var endDate = new Date(date);
        if(endDate instanceof Date){
            endDate = endDate.getTime() + 86400000 * 4;
            endDate = Utils.dateFormat(endDate, "yyyy-MM-dd");
        }else{
            endDate = date;
        }
        var loc_query = {
            $or : [
                {
                    type : "1",
                    date : date
                },{
                    type : "3",
                    date : {$gte : date, $lte : endDate}
                }
            ],
            valid : 1
        };
        if(dataType==1){
            loc_query.dataType = {$in : [0,1]}
        }else if(dataType==2){
            loc_query.dataType = {$in : [0,2]}
        }

        APIUtil.DBFind(ZxFinanceEvent, {
            query : loc_query,
            sortAsc : ["time", "country"]
        }, function(err, events){
            if(err){
                Logger.error("<<getEventList:查询财经事件信息出错，[errMessage:%s]", err);
                callback(null, null);
                return;
            }
            callback(null, events);
        });
    },

    /**
     * 获取财经数据：财经日历 + 财经事件 + 假期预告
     * @param date
     * @param dataType
     * @param callback (err, datas)
     */
    getFinanceData : function(date, dataType, callback){
        Async.parallel({
            datas : function(callbackTmp){
                zxFinanceService.getDataList(date, dataType, function(err, datas){
                    var loc_datas = [];
                    var loc_data = null;
                    for(var i = 0, lenI = datas == null ? 0 : datas.length; i < lenI; i++){
                        loc_data = datas[i];
                        loc_datas.push({
                            dataId          : loc_data._id.toString(),
                            name            : loc_data.name,
                            country         : loc_data.country,
                            basicIndexId    : loc_data.basicIndexId,
                            predictValue    : Common.trim(loc_data.predictValue),
                            lastValue       : Common.trim(loc_data.lastValue),
                            value           : Common.trim(loc_data.value),
                            date            : loc_data.date,
                            time            : loc_data.time,
                            importanceLevel : loc_data.importanceLevel,
                            dataType        : loc_data.dataType,
                            description     : loc_data.description,
                            dataStatus      : (!loc_data.explanation || !loc_data.influence) ? 2 : 1
                        });
                    }
                    callbackTmp(null, loc_datas);
                });
            },
            events : function(callbackTmp){
                zxFinanceService.getEventList(date, dataType, function(err, events){
                    var loc_events = {
                        events : [],
                        vacations : []
                    };
                    var loc_event = null;
                    var loc_target = null;
                    for(var i = 0, lenI = events == null ? 0 : events.length; i < lenI; i++){
                        loc_event = events[i];
                        loc_target = {
                            country         : loc_event.country,
                            region          : loc_event.region,
                            title           : loc_event.title,
                            content         : loc_event.content,
                            date            : loc_event.date,
                            time            : loc_event.time,
                            importanceLevel : loc_event.importanceLevel,
                            dataType        : loc_event.dataType
                        };
                        if(loc_event.type == "1"){
                            loc_events.events.push(loc_target);
                        }else if(loc_event.type == "3"){
                            loc_events.vacations.push(loc_target);
                        }
                    }
                    callbackTmp(null, loc_events);
                });
            }
        }, function(err, results){
            callback(null, {
                financeEvent:results.events.events,
                financeVacation:results.events.vacations,
                financeData:results.datas
            });
        });
    },

    /**
     * 获取财经日历历史数据
     * @param basicIndexId 指标编号
     * @param startTime 开始日期 yyyy-MM-dd
     * @param endTime 结束日期 yyyy-MM-dd
     * @param callback (err, data)
     */
    getFinanceDataHis : function(basicIndexId, startTime, endTime, callback){
        var loc_query = {
            basicIndexId : basicIndexId,
            valid : 1
        };
        if(startTime || endTime){
            loc_query.date = {};
            if(startTime){
                loc_query.date.$gte = startTime;
            }
            if(endTime){
                loc_query.date.$lte = endTime;
            }
        }

        APIUtil.DBFind(ZxFinanceData, {
            query : loc_query,
            sortAsc : ["date", "time"]
        }, function(err, datas){
            if(err){
                Logger.error("<<getFinanceDataHis:查询财经日历历史数据信息出错，[errMessage:%s]", err);
                callback(null, null);
                return;
            }
            if(datas == null || datas.length == 0){
                callback(null, null);
                return;
            }
            var loc_result = {
                history:[]
            };
            var loc_data = null;
            for(var i = 0, lenI = datas.length - 1; i <= lenI; i++){
                loc_data = datas[i];
                if(i == lenI){
                    loc_result.detail = {
                        name            : loc_data.name,
                        country         : loc_data.country,
                        basicIndexId    : loc_data.basicIndexId,
                        positiveItem    : loc_data.positiveItem,
                        negativeItem    : loc_data.negativeItem,
                        level           : loc_data.level,
                        url             : loc_data.url,
                        unit            : loc_data.unit,
                        interpretation  : loc_data.interpretation,
                        publishOrg      : loc_data.publishOrg,
                        publishFrequncy : loc_data.publishFrequncy,
                        statisticMethod : loc_data.statisticMethod,
                        explanation     : loc_data.explanation,
                        influence       : loc_data.influence,
                        importanceLevel : loc_data.importanceLevel,
                        dataType        : loc_data.dataType
                    };
                }
                loc_result.history.push({
                    dataId          : loc_data._id.toString(),
                    predictValue    : Common.trim(loc_data.predictValue),
                    lastValue       : Common.trim(loc_data.lastValue),
                    value           : Common.trim(loc_data.value),
                    year            : loc_data.year,
                    date            : loc_data.date,
                    time            : loc_data.time,
                    period          : loc_data.period,
                    nextPublishTime : loc_data.nextPublishTime
                });
            }
            callback(null, loc_result);
        });
    },

    /**
     * 获取财经日历详情数据
     * @param dataId 财经日历编号
     * @param callback (err, data)
     */
    getFinanceDataDetail : function(dataId, callback){
        var loc_query = {
            _id : dataId,
            valid : 1
        };

        APIUtil.DBFindOne(ZxFinanceData, {
            query : loc_query,
            fieldEx : ['createDate','createUser','createIp','updateDate','updateUser','updateIp']
        }, function(err, data){
            if(err){
                Logger.error("<<getFinanceDataDetail:查询财经日历详情数据信息出错，[errMessage:%s]", err);
                callback(null, null);
                return;
            }
            if(!data){
                callback(null, null);
                return;
            }
            data = data.toObject();
            data.predictValue = Common.trim(data.predictValue);
            data.lastValue = Common.trim(data.lastValue);
            data.value = Common.trim(data.value);
            callback(null, data);
        });
    },

    /**
     * 格式化请求URL
     * @param path
     */
    formatUrl : function(path){
        return Config.fxgoldApiUrl + path;
    },

    /**
     * 从fxgold获取财经日历数据
     * @param date 2015-11-09
     * @param callback
     */
    getDataFromFxGold : function(date, callback){
        if(!date){
            Logger.warn("IndexEventApi error: date is empty!");
            callback([]);
            return;
        }
        Request.get(zxFinanceService.formatUrl("/IndexEventApi?date=" + date), function(err, res, data){
            if(err){
                Logger.warn("IndexEventApi error[URL=" + this.uri.href + "]：" + err);
                callback([]);
                return;
            }
            var result = [];
            if(data){
                try{
                    data = JSON.parse(data);
                    result = data.data instanceof Array ? data.data : [];
                }catch(e){
                    Logger.warn("IndexEventApi error[URL=" + this.uri.href + "]：" + e);
                }
            }
            callback(result);
        });
    },

    /**
     * 从fxgold获取财经日历详情数据
     * @param basicIndexId 20
     * @param callback
     */
    getDetailFromFxGold : function(basicIndexId, callback){
        if(!basicIndexId){
            Logger.warn("IndexEventDetailApi error: basicIndexId is empty!");
            callback(null);
            return;
        }
        Request.get(zxFinanceService.formatUrl("/IndexEventDetailApi?basicIndexId=" + basicIndexId), function(err, res, data){
            if(err){
                Logger.warn("IndexEventDetailApi error[URL=" + this.uri.href + "]：" + err);
                callback(null);
                return;
            }
            var result = null;
            if(data){
                try{
                    data = JSON.parse(data);
                    result = (data.data instanceof Array && data.data.length > 0) ? data.data[0] : null;
                }catch(e){
                    Logger.warn("IndexEventDetailApi error[URL=" + this.uri.href + "]：" + e);
                }
            }
            callback(result);
        });
    },

    /**
     * 从fxgold获取财经大事数据
     * @param date 2015-11-09
     * @param callback
     */
    getEventFromFxGold : function(date, callback){
        if(!date){
            Logger.warn("FinanceEventApi error: date is empty!");
            callback([]);
            return;
        }
        Request.get(zxFinanceService.formatUrl("/FinanceEventApi?date=" + date), function(err, res, data){
            if(err){
                Logger.warn("FinanceEventApi error[URL=" + this.uri.href + "]：" + err);
                callback([]);
                return;
            }
            var result = [];
            if(data){
                try{
                    data = JSON.parse(data);
                    result = data.data instanceof Array ? data.data : [];
                }catch(e){
                    Logger.warn("FinanceEventApi error[URL=" + this.uri.href + "]：" + e);
                }
            }
            callback(result);
        });
    },

    /**
     * 按照财经日历列表，查询配置MAP
     * @param datas
     * @param callback
     */
    getDataConfigs : function(datas, callback){
        if (!datas || !datas instanceof Array || datas.length == 0)
        {
            callback({});
        }
        var basicIndexIds = {};
        for (var i = 0, lenI = datas.length; i < lenI; i++)
        {
            basicIndexIds[datas[i].basicIndexId] = "";
        }
        APIUtil.DBFind(ZxFinanceDataCfg, {
            query : {"_id" : { $in : Object.keys(basicIndexIds) }}
        }, function(err, configs){
            if(err || !configs){
                callback({});
                return;
            }
            var loc_result = {};
            for(var i = 0, lenI = configs.length; i < lenI; i++){
                loc_result[configs[i]._id] = configs[i];
            }

            callback(loc_result);
        });
    },

    /**
     * 查找单个财经日历
     * @param basicIndexId 指标编号
     * @param period 周期
     * @param year 年
     * @param callback
     */
    findData : function(basicIndexId, period, year, callback){
        APIUtil.DBFindOne(ZxFinanceData, {
            query : {
                basicIndexId : basicIndexId,
                period : period,
                year : year
            }
        }, function(err, data){
            if(err || !data){
                callback(null);
                return;
            }
            callback(data);
        });
    },

    /**
     * 查找单个财经大事
     * @param eventType  事件种类
     * @param eventTitle 事件标题
     * @param eventDate  事件日期
     * @param eventTime  事件时间
     * @param callback
     */
    findEvent : function(eventType, eventTitle, eventDate, eventTime, callback){
        APIUtil.DBFindOne(ZxFinanceEvent, {
            query : {
                type : eventType,
                title : eventTitle,
                date : eventDate,
                time : eventTime
            }
        }, function(err, data){
            if(err || !data){
                callback(null);
                return;
            }
            callback(data);
        });
    },

    /**
     * 批量保存财经数据配置
     * @param cfgs
     * @param callback
     */
    saveDataCfgs : function(cfgs, callback){
        if(!cfgs || cfgs.length == 0){
            callback();
            return;
        }
        var cfgsArr = [], step = 1000;
        for(var i = 0, lenI = cfgs.length; i < lenI; i+= step){
            cfgsArr.push(cfgs.slice(i, i + step));
        }
        Async.forEach(cfgsArr, function(cfgsTmp, callbackTmp){
            ZxFinanceDataCfg.collection.insert(cfgsTmp, function(errTmp){
                if(errTmp){
                    Logger.error("saveDataCfgs error: " + errTmp);
                }
                callbackTmp();
            });
        }, function(err){
            if(err){
                Logger.error("saveDataCfgs error: " + err);
                callback(true);
            }else{
                callback();
            }
        });
    },

    /**
     * 批量保存财经数据
     * @param datas
     * @param callback
     */
    saveDatas : function(datas, callback){
        if(!datas || datas.length == 0){
            callback();
            return;
        }
        var datasArr = [], step = 1000;
        for(var i = 0, lenI = datas.length; i < lenI; i+= step){
            datasArr.push(datas.slice(i, i + step));
        }
        Async.forEach(datasArr, function(datasTmp, callbackTmp){
            ZxFinanceData.collection.insert(datasTmp, function(errTmp){
                if(errTmp){
                    Logger.error("saveDatas error: " + errTmp);
                }
                callbackTmp();
            });
        }, function(err){
            if(err){
                Logger.error("saveDatas error: " + err);
                callback(true);
            }else{
                callback();
            }
        });
    },

    /**
     * 批量保存财经事件
     * @param events
     * @param callback
     */
    saveEvents : function(events, callback){
        if(!events || events.length == 0){
            callback();
            return;
        }
        var eventsArr = [], step = 1000;
        for(var i = 0, lenI = events.length; i < lenI; i+= step){
            eventsArr.push(events.slice(i, i + step));
        }
        Async.forEach(eventsArr, function(eventsTmp, callbackTmp){
            ZxFinanceEvent.collection.insert(eventsTmp, function(errTmp){
                if(errTmp){
                    Logger.error("saveEvents error: " + errTmp);
                }
                callbackTmp();
            });
        }, function(err){
            if(err){
                Logger.error("saveEvents error: " + err);
                callback(true);
            }else{
                callback();
            }
        });
    },

    /**
     * 转化重要性：low-1、mid-2、high-3
     * @param importance
     * @returns {number}
     */
    formatImportance : function(importance){
        if ("high" == importance){
            return 3;
        }else if ("mid" == importance) {
            return 2;
        }else if ("low" == importance) {
            return 1;
        }
        return 0;
    },

    /**
     * 计算默认的重要级别
     * @param importance
     */
    getDefImportanceLevel : function(importance){
        var result = 0;
        switch(importance){
            case 1:
                result = 1;
                break;

            case 2:
                result = Math.random() >= 0.5 ? 2 : 3;
                break;

            case 3:
                result = Math.random() >= 0.5 ? 4 : 5;
                break;

            default:
                break;
        }
        return result;
    },

    /**
     * 描述：默认WH_ZX_U_U_U
     * 预期影响：正向，预期值>前值 利多;预期值<前值 利空;预期值=前值 持平;
     *         反向，预期值>前值 利空;预期值<前值 利多;预期值=前值 持平;
     *         前值或预期值无效 未知
     * 实际影响：正向，公布值>前值 利多;公布值<前值 利空;公布值=前值 持平;
     *         反向，公布值>前值 利空;公布值<前值 利多;公布值=前值 持平;
     *         前值或公布值无效 未知
     * 影响力度：前值为0，影响度 = |公布值| * 重要级数
     *         前值不为0，影响度 = |(公布值-前值)/前值| * 重要级数
     *         影响度[0,20%）LV1;[20%,50%）LV2;[50%,∞）LV3;
     *         前值或公布值无效 未知
     * @param data
     */
    getDescription : function(data){
        var description = data.description;
        if (!description){
            description = "WH_ZX_U_U_U";//默认是外汇正向
        }
        //计算前值、预期值、公布值
        var numRegExp = /^[+-]?\d+(\.\d+)?$/;
        var strRegExp = /[^0-9\-\.]/g;
        var predictValue = null;	//预期值
        var lastValue = null;     //前值
        var value = null;         //公布值
        var valTemp = null;
        valTemp = data.predictValue;
        if(valTemp){
            valTemp = valTemp.replace(strRegExp, "");
            if(numRegExp.test(valTemp)){
                predictValue = parseFloat(valTemp);
            }
        }
        valTemp = data.lastValue;
        if(valTemp){
            valTemp = valTemp.replace(strRegExp, "");
            if(numRegExp.test(valTemp)){
                lastValue = parseFloat(valTemp);
            }
        }
        valTemp = data.value;
        if(valTemp){
            valTemp = valTemp.replace(strRegExp, "");
            if(numRegExp.test(valTemp)){
                value = parseFloat(valTemp);
            }
        }

        //计算预期影响、实际影响、影响力度
        var comp = 0;
        var isZX = false;
        var srcArr = description.split(",");
        var lenI = srcArr.length;
        var destArr = new Array(lenI);
        var descs = null;
        for(var i = 0; i < lenI; i++){
            description = srcArr[i];
            descs = description.split("_");
            isZX = "ZX" == descs[1];
            if (lastValue == null){
                descs[2] = "U";
                descs[3] = "U";
                descs[4] = "U";
            }else {
                if (predictValue == null)
                {
                    descs[2] = "U";
                }else{
                    comp = predictValue - lastValue;
                    if (comp == 0){
                        descs[2] = "FLAT";
                    }else if((comp > 0 && isZX) || (comp < 0 && !isZX)){
                        descs[2] = "GOOD";
                    }else{
                        descs[2] = "BAD";
                    }
                }
                if (value == null)
                {
                    descs[3] = "U";
                    descs[4] = "U";
                }else{
                    comp = value - lastValue;
                    if (comp == 0)
                    {
                        descs[3] = "FLAT";
                    }else if((comp > 0 && isZX) || (comp < 0 && !isZX)){
                        descs[3] = "GOOD";
                    }else{
                        descs[3] = "BAD";
                    }
                    //影响力度
                    var rate = lastValue == 0 ? value : ((value - lastValue) / lastValue);
                    rate = Math.abs(rate) * data.importanceLevel;
                    if(rate < 0.2){
                        descs[4] = "LV1";
                    }else if(rate < 0.5){
                        descs[4] = "LV2";
                    }else{
                        descs[4] = "LV3";
                    }
                }
            }
            destArr[i] = descs.join("_");
        }
        return destArr.join(",");
    },

    /**
     * 通过API数据刷新财经日历数据
     * @param dbData
     * @param apiData
     * @param apiDetail
     * @returns {*}
     */
    refreshData : function(dbData, apiData, apiDetail){
        if(!dbData){
            dbData = {};
        }
        dbData.name         = apiData.name;
        dbData.country      = apiData.country;
        dbData.basicIndexId = apiData.basicIndexId;
        dbData.period       = apiData.period;
        dbData.importance   = zxFinanceService.formatImportance(apiData.importance);
        dbData.predictValue = apiData.predictValue;
        dbData.lastValue    = apiData.lastValue;
        dbData.value        = apiData.value;
        dbData.year         = apiData.year;
        dbData.positiveItem = apiData.positiveItem;
        dbData.negativeItem = apiData.negativeItem;
        dbData.level        = apiData.level;
        dbData.url          = apiData.url;
        dbData.date         = apiData.date;
        dbData.time         = apiData.time;

        if(apiDetail){
            dbData.unit            = apiDetail.unit;
            dbData.interpretation  = apiDetail.interpretation;
            dbData.publishOrg      = apiDetail.publishOrganization;
            dbData.publishFrequncy = apiDetail.publishFrequncy;
            dbData.statisticMethod = apiDetail.statisticMethod;
            dbData.explanation     = apiDetail.explanation;
            dbData.influence       = apiDetail.influence;
            if(apiDetail.newestDataPoint
                && apiDetail.newestDataPoint.publishTime
                && (dbData.date + " " + dbData.time + ".0") == apiDetail.newestDataPoint.publishTime){
                dbData.nextPublishTime = apiDetail.nextpublishTime;
            }
        }
        return dbData;
    },

    /**
     * 通过API数据刷新财经大事数据
     * @param dbEvent
     * @param apiEvent
     * @returns {*}
     */
    refreshEvent : function(dbEvent, apiEvent){
        if(!dbEvent){
            dbEvent = {};
        }
        dbEvent.status     = apiEvent.eventStatus;
        dbEvent.type       = apiEvent.eventType;
        dbEvent.country    = apiEvent.eventCountry;
        dbEvent.region     = apiEvent.eventRegion;
        dbEvent.importance = zxFinanceService.formatImportance(apiEvent.eventImportance);
        dbEvent.content    = apiEvent.eventContent;
        dbEvent.title      = apiEvent.eventTitle;
        dbEvent.link       = apiEvent.eventLink;
        dbEvent.date       = apiEvent.eventDate;
        dbEvent.time       = apiEvent.eventTime;
        return dbEvent;
    },

    /**
     * 从fxgold获取数据并更新到本地数据库
     * @param dates
     * @param callback
     */
    importDataFromFxGold : function(dates, callback){
        if(!dates || (dates instanceof Array && dates.length == 0)){
            callback(true);
            return;
        }
        dates = typeof dates === "string" ? [dates] : dates;
        //从金汇API中获取最新财经数据
        Async.map(dates, function(dateTmp, callbackMap){
            zxFinanceService.getDataFromFxGold(dateTmp, function(datasTmp){
                callbackMap(null, datasTmp);
            })
        }, function(err, results){
            var apiDatas = Array.prototype.concat.apply([], results);
            var newDatas = [];
            var detailsCache = {};
            var currDate = new Date();
            Async.forEach(apiDatas, function(apiData, callbackEach){
                zxFinanceService.findData(apiData.basicIndexId, apiData.period, apiData.year, function(dbData){
                    if(detailsCache.hasOwnProperty(apiData.basicIndexId)){
                        //财经详情数据已经缓存
                        var apiDetail = detailsCache[apiData.basicIndexId];
                        if(!dbData){
                            dbData = zxFinanceService.refreshData(null, apiData, apiDetail);
                            dbData.createDate = currDate;
                            dbData.updateDate = currDate;
                            newDatas.push(dbData);
                            callbackEach(null);
                        }else{
                            dbData = zxFinanceService.refreshData(dbData, apiData, apiDetail);
                            //数据更新的直接用现有数据更新描述，不需要查询配置信息，因为配置更新的时候会更新所有数据
                            dbData.description = zxFinanceService.getDescription(dbData);
                            dbData.updateDate = currDate;
                            dbData.save(function(){
                                callbackEach(null);
                            });
                        }
                    }else{
                        //从金汇API中获取最新财经详情数据
                        zxFinanceService.getDetailFromFxGold(apiData.basicIndexId, function(apiDetail){
                            if(apiDetail && apiDetail.basicIndexId){
                                detailsCache[apiDetail.basicIndexId] = apiDetail;
                            }
                            if(!dbData){
                                dbData = zxFinanceService.refreshData(null, apiData, apiDetail);
                                dbData.createDate = currDate;
                                dbData.updateDate = currDate;
                                newDatas.push(dbData);
                                callbackEach(null);
                            }else{
                                dbData = zxFinanceService.refreshData(dbData, apiData, apiDetail);
                                //数据更新的直接用现有数据更新描述，不需要查询配置信息，因为配置更新的时候会更新所有数据
                                dbData.description = zxFinanceService.getDescription(dbData);
                                dbData.updateDate = currDate;
                                dbData.save(function(){
                                    callbackEach(null);
                                });
                            }
                        });
                    }
                });
            }, function(){
                if(newDatas.length == 0){
                    callback(true);
                    return;
                }
                zxFinanceService.getDataConfigs(newDatas, function(configs){
                    var newConfigs = [];
                    var configTmp = null;
                    var description = null;
                    var newDataTmp = null;
                    for(var i = 0, lenI = newDatas.length; i < lenI; i++){
                        newDataTmp = newDatas[i];
                        if(configs.hasOwnProperty(newDataTmp.basicIndexId)){
                            configTmp = configs[newDataTmp.basicIndexId];
                            description = configTmp.description;
                            description = description.replace(/,/g, "_U_U_U,") + "_U_U_U";
                            newDataTmp.importanceLevel = configTmp.importanceLevel;
                            newDataTmp.description     = description;
                            newDataTmp.description     = zxFinanceService.getDescription(newDataTmp);
                            newDataTmp.valid           = configTmp.valid;
                            newDataTmp.dataType        = configTmp.dataType;
                        }else{
                            newDataTmp.importanceLevel = zxFinanceService.getDefImportanceLevel(newDataTmp.importance); //默认重要等级
                            newDataTmp.dataType = 0; //默认数据类型
                            newDataTmp.valid = 1; //默认有效性
                            newDataTmp.description = zxFinanceService.getDescription(newDataTmp);

                            //不存在配置，自动新增一个默认配置
                            configTmp = {};
                            configTmp._id             = newDataTmp.basicIndexId;
                            configTmp.country         = newDataTmp.country;
                            configTmp.createDate      = currDate;
                            configTmp.dataType        = newDataTmp.dataType;
                            configTmp.description     = "WH_ZX"; //默认是外汇正向
                            configTmp.importanceLevel = newDataTmp.importanceLevel;
                            configTmp.name            = newDataTmp.name;
                            configTmp.updateDate      = currDate;
                            configTmp.valid           = newDataTmp.valid;
                            newConfigs.push(configTmp);
                            configs[configTmp._id] = configTmp;
                        }
                    }
                    //批量保存配置信息
                    zxFinanceService.saveDataCfgs(newConfigs, function(errCfgs){
                        //批量保存财经数据
                        zxFinanceService.saveDatas(newDatas, function(errDatas){
                            callback(!errCfgs && !errDatas);
                        });
                    });
                });
            });
        });
    },

    /**
     * 从fxgold获取数据并更新到本地数据库
     * @param dates
     * @param callback
     */
    importEventFromFxGold : function(dates, callback){
        if(!dates || (dates instanceof Array && dates.length == 0)){
            callback(true);
            return;
        }
        dates = typeof dates === "string" ? [dates] : dates;
        Async.map(dates, function(dateTmp, callbackMap){
            zxFinanceService.getEventFromFxGold(dateTmp, function(eventsTmp){
                callbackMap(null, eventsTmp);
            })
        }, function(err, results) {
            var apiEvents = Array.prototype.concat.apply([], results);
            var newEvents = [];
            var currDate = new Date();
            Async.forEach(apiEvents, function(apiEvent, callbackEach) {
                zxFinanceService.findEvent(apiEvent.eventType, apiEvent.eventTitle, apiEvent.eventDate, apiEvent.eventTime, function (dbEvent) {
                    if(!dbEvent){
                        dbEvent = zxFinanceService.refreshEvent(null, apiEvent);
                        dbEvent.valid = 1;
                        dbEvent.importanceLevel = zxFinanceService.getDefImportanceLevel(dbEvent.importance);
                        dbEvent.dataType = 0;
                        dbEvent.createDate = currDate;
                        dbEvent.updateDate = currDate;
                        newEvents.push(dbEvent);
                        callbackEach(null);
                    }else{
                        dbEvent = zxFinanceService.refreshEvent(dbEvent, apiEvent);
                        dbEvent.updateDate = currDate;
                        dbEvent.save(function(){
                            callbackEach(null);
                        });
                    }
                });
            }, function(){
                if(newEvents.length == 0){
                    callback(true);
                    return;
                }
                //批量保存财经数据
                zxFinanceService.saveEvents(newEvents, function(errEvents){
                    callback(!errEvents);
                });
            });
        });
    }
};

//导出服务类
module.exports =zxFinanceService;