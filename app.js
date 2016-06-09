// from: http://stackoverflow.com/a/14810714
Object.defineProperty(Object.prototype, 'map', {
    value: function(f, ctx) {
        ctx = ctx || this;
        var self = this, result = {};
        Object.keys(self).forEach(function(k) {
            result[k] = f.call(ctx, self[k], k, self);
        });
        return result;
    }
});

// from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
if (!Object.assign) {
    Object.defineProperty(Object, 'assign', {
        enumerable: false,
        configurable: true,
        writable: true,
        value: function(target) {
            'use strict';
            if (target === undefined || target === null) {
                throw new TypeError('Cannot convert first argument to object');
            }

            var to = Object(target);
            for (var i = 1; i < arguments.length; i++) {
                var nextSource = arguments[i];
                if (nextSource === undefined || nextSource === null) {
                    continue;
                }
                nextSource = Object(nextSource);

                var keysArray = Object.keys(Object(nextSource));
                for (var nextIndex = 0, len = keysArray.length; nextIndex < len; nextIndex++) {
                    var nextKey = keysArray[nextIndex];
                    var desc = Object.getOwnPropertyDescriptor(nextSource, nextKey);
                    if (desc !== undefined && desc.enumerable) {
                        to[nextKey] = nextSource[nextKey];
                    }
                }
            }
            return to;
        }
    });
}

var belasting = function () {
    var box1 = function(inkomen) {
        if(inkomen >= 57585) {
            return 23095.49 + (inkomen - 57585) * 0.52;
        } else if(inkomen >= 19822) {
            return 7235.03 + (inkomen - 19822) * 0.404;
        } else if(inkomen >= 0) {
            return inkomen * 0.3655;
        } else {
            return 0;
        }
    };

    var eigenwoningforfait = function(woz) {
        if(woz >= 1050000) {
            return 7875 + (woz - 1050000) * 0.0235;
        } else if(woz >= 75000) {
            return woz * 0.0075;
        } else if(woz >= 50000) {
            return woz * 0.006;
        } else if(woz >= 25000) {
            return woz * 0.0045;
        } else if(woz >= 12500) {
            return woz * 0.003;
        } else {
            return 0;
        }
    };

    var taxRelief = function(income0, income1, paidMortgageInterest, wozValue) {
        var mortgageRentaftrek = Math.max(paidMortgageInterest - eigenwoningforfait(wozValue), 0);
        if(income1 == 0) {
            return box1(income0) - box1(Math.max(income0 - mortgageRentaftrek, 0));
        } else {
            var adjusted0 = income0,
                adjusted1 = income1;
            if(income0 < income1) {
                var diff = Math.min(income1 - income0, mortgageRentaftrek);
                adjusted0 -= (mortgageRentaftrek - diff) / 2;
                adjusted1 -= diff + (mortgageRentaftrek - diff) / 2;
            } else {
                var diff = Math.min(income0 - income1, mortgageRentaftrek);
                adjusted0 -= diff + (mortgageRentaftrek - diff) / 2;
                adjusted1 -= (mortgageRentaftrek - diff) / 2;
            }
            return box1(income0) + box1(income1) - box1(adjusted0) - box1(adjusted1);
        }
    };

    return {
        box1: box1,
        eigenwoningforfait: eigenwoningforfait,
        taxRelief: taxRelief,
    };
}();

var mortgage = function() {
    // rente per jaar
    // duur in jaren
    var annuity = function(lening, rente, duur) {
        duur *= 12;
        if(rente === 0) { return lening / duur; }
        rente /= 12;
        return lening / ((1 - Math.pow(1 / (1 + rente), duur)) / rente);
    };

    // rente_percentage per jaar
    // annuiteit per maand
    // mortgageRent over geheel jaar
    var interest = function(schuld, rentepercentage, annuiteit) {
        return d3.range(0, 12).reduce(function(som) {
            var rente = schuld * rentepercentage / 12;
            schuld -= annuiteit - rente;
            return som + rente;
        }, 0)
    };

    return {
        annuity: annuity,
        interest: interest,
    };
}();

var calculateBuy = function(input) {
    var debt = input.purchasePrice * input.hypotheekDeel,
        annuity = mortgage.annuity(debt, input.mortgageRent, input.hypotheekDuur),
        buy = {
            initial: 0,
            recurring: 0,
            opportunity: 0,
            proceeds: 0,
            total: 0,
        };

    // Buying costs.
    buy.initial += input.purchasePrice * input.koopKosten;

    // Selling costs.
    buy.proceeds += input.purchasePrice * input.verkoopKosten;

    // Total sale value of house.
    buy.proceeds -= input.purchasePrice * Math.pow(1 + input.housePriceIncrease, input.duration);

    for(var year = 0; year < input.duration; year++) {
        var yearPaidInterest = 0,
            yearRecurringCosts = input.purchasePrice * input.ozbTarief + input.rioolheffingEigenaar,
            // investment return at end of year.
            yearInvestmentReturn = Math.pow(1 + input.investmentReturn, input.duration - year - 1) - 1;

        yearRecurringCosts += input.purchasePrice * input.insurance;
        yearRecurringCosts += input.purchasePrice * input.maintenance;

        if(year < input.hypotheekDuur) {
            for(var month = 0; month < 12; month++) {
                var monthPaidInterest = debt * input.mortgageRent / 12;
                yearPaidInterest += monthPaidInterest;
                debt -= (annuity - monthPaidInterest);
                buy.recurring += annuity;
                buy.opportunity += annuity * (Math.pow(1 + input.investmentReturn, input.duration - (year + month / 12)) - 1);
            }
        }

        yearRecurringCosts -= belasting.taxRelief(input.income0, input.income1, yearPaidInterest, input.purchasePrice);

        buy.recurring += yearRecurringCosts;
        buy.opportunity += yearRecurringCosts * yearInvestmentReturn;
    }

    buy.proceeds += debt;

    buy.total = buy.initial + buy.recurring + buy.opportunity + buy.proceeds;

    return buy;
};

var calculateRent = function(input, buy) {
    var rent = {
        initial: 0,
        recurring: 0,
        opportunity: 0,
        proceeds: 0,
        total: 0,
        rent: 1000,
    };

    // We'll calculate with a fictious rate of 1000 per month. As all expenses
    // are ratios, we'll ratio the values by ``buy.total / rent.total``.

    // Security deposit.
    var deposit = rent.rent * input.rentSecurityDeposit,
        brokerFee = rent.rent * 12 * input.rentBrokerFee;
    rent.initial += deposit + brokerFee;
    rent.opportunity += (deposit + brokerFee) * (Math.pow(1 + input.investmentReturn, input.duration) - 1);
    rent.proceeds -= deposit;

    for(var year = 0; year < input.duration; year++) {
        var yearRent = rent.rent * Math.pow(1 + input.rentGrowth, year);
        for(var month = 0; month < 12; month++) {
            var monthRecurring = yearRent;

            rent.recurring += yearRent;
            rent.opportunity += yearRent * (Math.pow(1 + input.investmentReturn, input.duration - (year + month / 12)) - 1);
        }
    }

    rent.total = rent.initial + rent.recurring + rent.opportunity + rent.proceeds;

    // Ratio all values.
    var ratio = buy.total / rent.total;
    return rent.map(function(v) { return v * ratio; });
};


var calculate = function(input) {
    var buy = calculateBuy(input),
        rent = calculateRent(input, buy);
    return {
        rent: rent,
        buy: buy,
    };
};

var input = {
    purchasePrice: 250000,
    duration: 8,
    hypotheekDeel: 1.03,  // ratio -- @todo, de kosten voor eigen inleg als opportunity cost!
    mortgageRent: 0.0215,
    hypotheekDuur: 30,
    housePriceIncrease: 0.02,
    ozbTarief: 0.0015,
    rioolheffingEigenaar: 105,
    koopKosten: 0.03,
    verkoopKosten: 0.04,
    investmentReturn: 0.04,
    income0: 30000,
    income1: 0,
    rentGrowth: 0.02, // jaarlijkse stijging van huurprijzen
    insurance: 0.0005,  // jaarlijks bedrag opstalverzekering
    maintenance: 0.005, // ratio, jaarlijks
    rentSecurityDeposit: 3, // aantal maanden
    rentBrokerFee: 0.0833, // ratio of first year's rent
};

var formatter = function(value) {
    // based upon http://stackoverflow.com/questions/149055/how-can-i-format-numbers-as-money-in-javascript#comment22014829_14428340
    return (value < 0 ? "-" : "") + "€" + Math.abs(value).toFixed(0).replace(/(\d)(?=(\d{3})+(?:\.\d+)?$)/g, "$1.");
}

var labelize = function(input, output) {
    if (output.rent.rent > 0) {
        d3.select("#outcome-positive").style("display", "block");
        d3.select("#outcome-negative").style("display", "none");
        d3.select("#outcome-positive .amount").data([output.rent.rent]).text(formatter);
    } else {
        d3.select("#outcome-positive").style("display", "none");
        d3.select("#outcome-negative").style("display", "block");
        d3.select("#outcome-negative .amount").data([output.rent.rent]).text(formatter);
    }
};

var tabulate = function(input, output) {
    var data = [
        [output.rent.initial, output.buy.initial],
        [output.rent.recurring, output.buy.recurring],
        [output.rent.opportunity, output.buy.opportunity],
        [output.rent.proceeds, output.buy.proceeds],
        [output.rent.total, output.buy.total],
    ];

    d3.select("#details").selectAll("tbody tr,tfoot tr")
        .data(data).selectAll("td:not(:first-child)")
            .data(function(d) { return d; })
            .text(formatter);

    d3.select("#details thead th")
        .data([input.duration])
        .text(function(d) { return "Op basis van " + d + " jaar" });
};


var graph = function(options) {
    var margin = {top: 20, right: 20, bottom: 38, left: 75},
        viewBoxWidth = 490,
        viewBoxHeight = 125,
        width = viewBoxWidth - margin.left - margin.right,
        height = viewBoxHeight - margin.top - margin.bottom;

    var selectedValue = options.initialValue;

    if(!options.y) { console.error("No `y` function"); }

    var xScale = options.xScale;

    var yScale = d3.scale.linear()
        .range([height, 0]).clamp(true);

    var xAxis = (options.xAxis || d3.svg.axis())
        .scale(xScale)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(yScale)
        .orient("left")
        .ticks(4);

    var svg = options.element
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .attr("viewBox", "0 0 "+viewBoxWidth+" "+viewBoxHeight)
        .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
            .style("pointer-events", "all");
    svg.append("g").attr("class", "bars");
    svg.append("rect").attr({class: "slot", x: 0.5, y: height + 0.5, width: width-1, height: 4, rx: 2, ry: 2})

    var gx = svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + (height + 7) + ")");

    var gy = svg.append("g")
        .attr("class", "y axis");

    var slider = svg.append("g").attr("class", "value");
    slider.append("path").attr("d", "M-5.5,-2.5v10l6,5.5l6,-5.5v-10z");
    slider.append("text").attr({y: 30, dy: ".5em"});

    var points = 40;

    var update = function() {
        var rangeBand = Math.floor(width / points) - 1,
            innerWidth = (rangeBand + 1) * points,
            leadingPadding = Math.floor((width - innerWidth) / 2 + rangeBand / 2),
            interval = [leadingPadding, leadingPadding + innerWidth];
        if(xScale.rangeRoundBands) {
            xScale.rangeRoundBands(interval);
        } else {
            xScale.range(interval);
        }

        var data = d3.range(leadingPadding, leadingPadding + innerWidth + 1, rangeBand + 1).map(function(px) {
            var x = xScale.invert(px);
            return [x, options.y(x)];
        });

        yScale.domain([0, Math.max(100, d3.max(data, function(d) { return d[1]; }))]);
        gx.call(xAxis);
        gy.call(yAxis);

        var bars = svg.select(".bars").selectAll(".bar")
            .data(data);

        bars.enter().append("rect").attr("class", "bar");
        bars.exit().remove();

        bars
            .attr("x", function(d) { return xScale(d[0]) - rangeBand / 2; })
            .attr("width", rangeBand)
            .attr("y", function(d) { return Math.min(yScale(0), yScale(d[1])); })
            .attr("height", function(d) { return Math.abs(height - yScale(d[1])); });

        renderSlider(selectedValue);

        return this;
    };
    var renderSlider = function() {
        var formatter = options.sliderFormat || xAxis.tickFormat() || d3.format();
        slider.select("text").text(formatter(selectedValue));
        slider.attr("transform", "translate("+xScale(selectedValue)+", "+(height-1)+")");
    };
    var sliderPrecision = function(value) {
        if(!options.sliderPrecision) { return value; }
        return Math.round(value / options.sliderPrecision) * options.sliderPrecision;
    };

    svg.on("mousedown", function(e) {
        d3.event.preventDefault();
        var mousemove = function() {
            var sx = d3.mouse(this)[0];
            selectedValue = sliderPrecision(xScale.invert(sx));
            renderSlider();
            options.didMoveSlider(selectedValue);
        }.bind(this);
        mousemove();
        svg.on("mousemove", mousemove);
        var clear = function() {
            svg.on("mousemove", null);
        };
        svg.on("mouseup", clear);
        svg.on("mouseout", clear);
    });

    svg.on("touchstart", function() {
        d3.event.preventDefault();
        var touchmove = function() {
            var sx = d3.touches(this)[0][0];
            selectedValue = sliderPrecision(xScale.invert(sx));
            renderSlider();
            options.didMoveSlider(selectedValue);
        }.bind(this);
        touchmove();
        svg.on("touchmove", touchmove);
        svg.on("touchend", function() {
            svg.on("touchmove", null);
            svg.on("touchend", null);
        });
    });

    svg.append('rect')
        .attr('class', 'click-capture')
        .style('visibility', 'hidden')
        .attr({x: 0, y: 0, width: width, height: height});

    return {
        setValue: function(value) {
            selectedValue = value;
            renderSlider();
        },
        update: update,
    };
}

var durationScale = d3.scale.ordinal().domain(d3.range(1,41));
durationScale.invert = function(value) {
    var x = Math.round((value - this.rangeExtent()[0]) / this.rangeBand());

    // clamp
    x = Math.max(0, Math.min(x, this.range().length - 1));

    return this.domain()[x];
};

function form(options) {
    function valid(value) {
        return value >= options.range[0] && value <= options.range[1];
    };

    var selectedValue = options.initialValue;

    options.element
        .attr("value", options.format(selectedValue))
        .on("keyup", function() {
            var value = options.parse(this.value);
            if(!valid(value)) { return; }
            options.didChangeValue(value);
        })
        .on("blur", function() {
            var value = options.parse(this.value);
            if(valid(value)) {
                selectedValue = value;
            }
            this.value = options.format(selectedValue);
            options.didChangeValue(selectedValue);
        });

    return {
        setValue: function(value) {
            selectedValue = value;
            options.element.node().value = options.format(selectedValue);
        }
    }
}

function parameter(name, options) {
    var options = Object.assign({
        initialValue: 0,
    }, options);

    options.graph = Object.assign({
        element: d3.select("#graph-" + name),
        initialValue: options.initialValue,
        y: function(value) {
            var copy = Object.assign({}, input);
            copy[name]= value;
            return calculate(copy).rent.rent;
        },
        didMoveSlider: function(value) {
            input[name] = value;
            update();
            parameter.form.setValue(value);
        },
    }, options.graph);

    options.form = Object.assign({
        element: d3.select("#input-" + name),
        initialValue: options.initialValue,
        parse: function(str) {
            return str.replace(/[^0-9^,]/g, "").replace(",", ".");
        },
        range: d3.extent(options.graph.xScale.domain()),
        format: Intl.NumberFormat().format,
        didChangeValue: function(value) {
            input[name] = value;
            update();
            parameter.graph.setValue(value);
        }
    }, options.form);

    var parameter = {
        graph: graph(options.graph),
        form: form(options.form),
    };
    return parameter;
}

var decimalFormatter = Intl.NumberFormat({maximumFractionDigits: 2}).format,
    percentageFormatter = function(value) {
        return decimalFormatter(value * 100) + "%";
    },
    percentageParser = function(str) {
        return Number(str.replace(/[^0-9^,]/g, "").replace(",", ".")) / 100
    },
    numberFormatter = Intl.NumberFormat().format,
    moneyFormatter = function(value) {
        return "€" + numberFormatter(value);
    };

var parameters = [
    parameter("purchasePrice", {
        initialValue: input.purchasePrice,
        graph: {
            xScale: d3.scale.log().domain([50e3, 3e6]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("s")).tickValues([100e3, 200e3, 1e6, 2e6]),
            sliderPrecision: 1000,
        },
        form: {
            format: moneyFormatter,
            range: [0, Infinity],
        },
    }),
    parameter("duration", {
        initialValue: input.duration,
        graph: {
            xScale: durationScale,
            xAxis: d3.svg.axis().tickValues(d3.range(10, 41, 10)),
        },
        form: {
            format: function(value) {
                return numberFormatter(value) + " jaar";
            },
        }
    }),
    parameter("mortgageRent", {
        initialValue: input.mortgageRent,
        graph: {
            xScale: d3.scale.linear().domain([0, 0.15001]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(4),
            sliderFormat: d3.format(".2%"),
        },
        form: {
            format: percentageFormatter,
            parse: percentageParser,
        },
    }),
    parameter("housePriceIncrease", {
        initialValue: input.housePriceIncrease,
        graph: {
            xScale: d3.scale.linear().domain([-0.05, 0.15001]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(5),
            sliderFormat: d3.format(".2%"),
        },
        form: {
            format: percentageFormatter,
            parse: percentageParser,
        },
    }),
    parameter("investmentReturn", {
        initialValue: input.investmentReturn,
        graph: {
            xScale: d3.scale.linear().domain([-0.1, 0.2]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(7),
            sliderFormat: d3.format(".2%"),
        },
        form: {
            format: percentageFormatter,
            parse: percentageParser,
        },
    }),
    parameter("rentGrowth", {
        initialValue: input.rentGrowth,
        graph: {
            xScale: d3.scale.linear().domain([-0.05, 0.15001]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(5),
            sliderFormat: d3.format(".2%"),
        },
        form: {
            format: percentageFormatter,
            parse: percentageParser,
        },
    }),
    parameter("income0", {
        initialValue: input.income0,
        graph: {
            xScale: d3.scale.linear().domain([0, 100000]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("s")).ticks(5),
            sliderPrecision: 1000,
        },
        form: {
            format: moneyFormatter,
        },
    }),
    parameter("income1", {
        initialValue: input.income1,
        graph: {
            xScale: d3.scale.linear().domain([0, 100000]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("s")).ticks(5),
            sliderPrecision: 1000,
        },
        form: {
            format: moneyFormatter,
        },
    }),
    parameter("ozbTarief", {
        initialValue: input.ozbTarief,
        graph: {
            xScale: d3.scale.linear().domain([0, 0.05]).clamp(true),
            xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(5),
            sliderFormat: d3.format(".2%"),
        },
        form: {
            format: percentageFormatter,
            parse: percentageParser,
        },
    }),
];

var outdatedGraphs = d3.set(),
    render = function() {
        var key = outdatedGraphs.values()[0];
        outdatedGraphs.remove(key);
        parameters[key].graph.update();
        if(!outdatedGraphs.empty()) {
            window.requestAnimationFrame(render);
        }
    },
    update = function() {
        var output = calculate(input);
        tabulate(input, output);
        labelize(input, output);
        Object.keys(parameters).forEach(function(key) {
            outdatedGraphs.add(key);
        });
        window.requestAnimationFrame(render);
    };

update();

window.addEventListener("scroll", function() {
    var offset = window.scrollY;
    d3.select("#calculation").style("padding-top", offset+"px");
});
