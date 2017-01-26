'use strict';

/**
 * get page informations
 * IMPORTANT: all of this code gets executed on browser side, so you won't have
 *            access to node specific interfaces at all
 */
var async = require('async'),
    xpath = require('xpath'),
    dom = require('xmldom').DOMParser,
    merge = require('deepmerge');

/**
 * little helper function to check against argument values
 * @param  {Object}  variable  some variable
 * @return {Boolean}           is true if typeof variable is number
 */
function isNumber(variable) {
    return typeof variable === 'number';
}

module.exports = function(done) {
    var that = this,
        response = {
            excludeRect: [],
            scrollPos: {
                x: 0,
                y: 0
            },
        },
        excludeRect = [],
        element = that.currentArgs.elem;

    if (!that.self.isMobileApp) {
        async.waterfall([
            /**
             * get page information
             */
            function(cb) {
                that.instance.execute(function() {
                        /**
                         * get current scroll position
                         * @return {Object}  x and y coordinates of current scroll position
                         */
                        var getScrollPosition = function() {
                            var x = 0,
                                y = 0;

                            if (typeof window.pageYOffset === 'number') {

                                /* Netscape compliant */
                                y = window.pageYOffset;
                                x = window.pageXOffset;

                            } else if (document.body && (document.body.scrollLeft || document.body.scrollTop)) {

                                /* DOM compliant */
                                y = document.body.scrollTop;
                                x = document.body.scrollLeft;

                            } else if (document.documentElement && (document.documentElement.scrollLeft || document.documentElement.scrollTop)) {

                                /* IE6 standards compliant mode */
                                y = document.documentElement.scrollTop;
                                x = document.documentElement.scrollLeft;

                            }

                            return {
                                x: x,
                                y: y
                            };
                        };

                        return {
                            title: document.title,
                            scrollPos: getScrollPosition(),
                            screenWidth: Math.max(document.documentElement.clientWidth, window.innerWidth || 0),
                            screenHeight: Math.max(document.documentElement.clientHeight, window.innerHeight || 0)
                        };
                    })
                    .then(function(pageInfo) {
                        cb(null, pageInfo);
                    });
            },

            /**
             * get element information
             */
            function(res, cb) {
                response = merge(response, res.value);

                if (!element) {
                    return cb(null, {}, {});
                }

                /**
                 * needs to get defined that verbose to make it working in IE driver
                 */
                that.instance.selectorExecute(element, function(elem) {
                        var boundingRect = elem[0].getBoundingClientRect();
                        return {
                            elemBounding: {
                                width: boundingRect.width ? boundingRect.width : boundingRect.right - boundingRect.left,
                                height: boundingRect.height ? boundingRect.height : boundingRect.bottom - boundingRect.top,
                                top: boundingRect.top,
                                right: boundingRect.right,
                                bottom: boundingRect.bottom,
                                left: boundingRect.left
                            }
                        };
                    })
                    .then(function(elementInfo) {
                        // ! TODO check response and its schema being correct here
                        cb(null, elementInfo, response);
                    });
            },

            /**
             * get information about exclude elements
             */
            function(res, responses, done) {
                response = merge(response, res);

                /**
                 * concatenate exclude elements to one dimensional array
                 * excludeElements = elements queried by specific selector strategy (typeof string)
                 * excludeCoords = x & y coords to exclude custom areas
                 */
                var excludeElements = [];

                if (!that.currentArgs.exclude) {
                    return done(null, []);
                } else if (!(that.currentArgs.exclude instanceof Array)) {
                    that.currentArgs.exclude = [that.currentArgs.exclude];
                }

                that.currentArgs.exclude.forEach(function(excludeElement) {
                    if (typeof excludeElement === 'string') {
                        excludeElements.push(excludeElement);
                    } else {
                        /**
                         * excludeCoords are a set of x,y rectangle
                         * then just check if the first 4 coords are numbers (minumum to span a rectangle)
                         */
                        if (isNumber(excludeElement.x0) && isNumber(excludeElement.x1) && isNumber(excludeElement.y0) && isNumber(excludeElement.y1)) {
                            response.excludeRect.push(excludeElement);
                        }
                    }
                });

                if (excludeElements.length === 0) {
                    return done(null, []);
                }

                that.instance.selectorExecute(excludeElements, function() {

                        /**
                         * excludeElements are elements queried by specific selenium strategy
                         */
                        var excludeElements = Array.prototype.slice.call(arguments),
                            excludeRect = [];

                        excludeElements.forEach(function(elements) {

                            if (!elements) {
                                return;
                            }

                            elements.forEach(function(elem) {
                                var elemRect = elem.getBoundingClientRect();
                                excludeRect.push({
                                    x0: elemRect.left,
                                    y0: elemRect.top,
                                    x1: elemRect.right,
                                    y1: elemRect.bottom
                                });
                            });
                        });

                        return excludeRect;

                    })
                    .then(function(excludeRect) {
                        done(null, excludeRect);
                    })
                    .catch(function(err) {
                        if (err.type === 'NoSuchElement') {
                            done(null, excludeRect);
                        } else {
                            done(err);
                        }
                    });
            }
        ], function(err, excludeElements) {

            if (excludeElements && excludeElements.length) {
                response.excludeRect = excludeRect.concat(excludeElements);
            }

            done(err, response);
        });
    } else {
        async.waterfall([
                function(cb) {

                    if (!element) {
                        return cb(null, {}, {});
                    }


                    /**
                     * needs to get defined that verbose to make it working in IE driver
                     */

                    that.instance.getSource().then((source) => {
                        var doc = new dom().parseFromString(source)
                        var nodes = xpath.select(element, doc);
                        var x, y, width, height, result;
                        var attrCounter = 0
                        if (Object.keys(nodes).length !== 0) {
                            for (var i = 0; i < nodes[0].attributes.length; i++) {
                                if (nodes[0].attributes[i].name == "bounds") {
                                    var bounds = nodes[0].attributes[i].value.replace("][", ",").replace("]", "").replace("[", "").split(",")
                                    result = {
                                        elemBounding: {
                                            width: parseInt(bounds[2]) - parseInt(bounds[0]),
                                            height: parseInt(bounds[3]) - parseInt(bounds[1]),
                                            top: parseInt(bounds[1]),
                                            right: parseInt(bounds[2]),
                                            bottom: parseInt(bounds[3]),
                                            left: parseInt(bounds[0])
                                        }
                                    };
                                    cb(null, result, response);
                                }

                                switch (nodes[0].attributes[i].name) {
                                    case 'x':
                                        x = nodes[0].attributes[i].value
                                    case 'y':
                                        y = nodes[0].attributes[i].value
                                    case 'width':
                                        width = nodes[0].attributes[i].value
                                    case 'height':
                                        height = nodes[0].attributes[i].value
                                }
                                attrCounter++
                                if (attrCounter === nodes[0].attributes.length && x && y && width && height) {
                                    result = {
                                        elemBounding: {
                                            width: parseInt(width),
                                            height: parseInt(height),
                                            top: parseInt(y),
                                            right: parseInt(x) + parseInt(width),
                                            bottom: parseInt(y) + parseInt(height),
                                            left: parseInt(x)
                                        }
                                    };
                                    cb(null, result, response);
                                }

                            }

                        } else {
                            var err = new Error()
                            cb(err)
                        }
                    });
                },

                /**
                 * get information about exclude elements
                 */
                function(res, responses, done) {
                    response = merge(response, res);

                    /**
                     * concatenate exclude elements to one dimensional array
                     * excludeElements = elements queried by specific selector strategy (typeof string)
                     * excludeCoords = x & y coords to exclude custom areas
                     */
                    var exclude = [];
                    var excludeElements = [];

                    if (!that.currentArgs.exclude) {
                        return done(null, []);
                    } else if (!(that.currentArgs.exclude instanceof Array)) {
                        that.currentArgs.exclude = [that.currentArgs.exclude];
                    }

                    that.currentArgs.exclude.forEach(function(excludeElement) {
                        if (typeof excludeElement === 'string') {
                            excludeElements.push(excludeElement);
                        } else {
                            /**
                             * excludeCoords are a set of x,y rectangle
                             * then just check if the first 4 coords are numbers (minumum to span a rectangle)
                             */
                            if (isNumber(excludeElement.x0) && isNumber(excludeElement.x1) && isNumber(excludeElement.y0) && isNumber(excludeElement.y1)) {
                                exclude.push(excludeElement);
                            }
                        }
                    });

                    if (excludeElements.length === 0) {
                        return done(null, []);
                    }

                    var countElem = 0;
                    excludeElements.forEach(function(element) {
                        that.instance.getSource().then((source) => {
                            var doc = new dom().parseFromString(source)
                            var nodes = xpath.select(element, doc);
                            var x, y, width, height, result;
                            var attrCounter = 0;
                            if (Object.keys(nodes).length !== 0) {
                                for (var i = 0; i < nodes[0].attributes.length; i++) {
                                    if (nodes[0].attributes[i].name == "bounds") {
                                        var bounds = nodes[0].attributes[i].value.replace("][", ",").replace("]", "").replace("[", "").split(",")
                                        exclude.push({
                                            x0: parseInt(bounds[0]),
                                            y0: parseInt(bounds[1]),
                                            x1: parseInt(bounds[2]),
                                            y1: parseInt(bounds[3])
                                        });
                                    }

                                    switch (nodes[0].attributes[i].name) {
                                        case 'x':
                                            x = nodes[0].attributes[i].value
                                        case 'y':
                                            y = nodes[0].attributes[i].value
                                        case 'width':
                                            width = nodes[0].attributes[i].value
                                        case 'height':
                                            height = nodes[0].attributes[i].value
                                    }
                                    attrCounter++
                                    if (attrCounter === nodes[0].attributes.length && x && y && width && height) {
                                        exclude.push({
                                            x0: parseInt(x),
                                            y0: parseInt(y),
                                            x1: parseInt(x) + parseInt(width),
                                            y1: parseInt(y) + parseInt(height)
                                        });
                                    }
                                }
                            }
                            countElem++;
                            if (countElem === excludeElements.length) {
                                done(null, exclude);
                            }
                        });
                    })
                }
            ],
            function(err, excludeElements) {
                if (excludeElements && excludeElements.length) {
                    response.excludeRect = excludeRect.concat(excludeElements);
                }
                done(err, response);
            });
    }
};
