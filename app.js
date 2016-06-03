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
    var box1Schijven = [
        {from: 0, to: 19822, ratio: 0.3650},
        {from: 19822, to: 33589, ratio: 0.42},
        {from: 33589, to: 57585, ratio: 0.42},
        {from: 57585, to: Infinity, ratio: 0.52},
    ];
    var box1 = function(inkomen) {
        return box1Schijven.reduce(function(sum, tier) {
            return Math.max(Math.min(tier.to, inkomen) - Math.min(tier.from, inkomen), 0) * tier.ratio + sum;
        }, 0);
    };

    var eigenwoningforfaitTarieven = [
        {from: 0, to: 12500, ratio: 0},
        {from: 12500, to: 25000, ratio: 0.003},
        {from: 25000, to: 50000, ratio: 0.0045},
        {from: 50000, to: 75000, ratio: 0.0060},
        {from: 75000, to: 1050000, ratio: 0.0075},
        {from: 1050000, to: Infinity, ratio: function(woz) { return 7875 + (woz - 1050000) * 0.0205 }},
    ];
    var eigenwoningforfait = function(woz) {
        var rate = eigenwoningforfaitTarieven.filter(function(rate) { return woz >= rate.from && woz < rate.to })[0];
        return typeof(rate.ratio) === "function" ? rate.ratio(woz) : woz * rate.ratio;
    };

    var taxRelief = function(incomes, paidMortgageInterest, wozValue) {
        var hypotheekrenteaftrek = Math.max(paidMortgageInterest - eigenwoningforfait(wozValue), 0);
        if(incomes.length == 1) {
            return box1(income) - box1(Math.max(income - hypotheekrenteaftrek, 0));
        } else if(incomes.length == 2) {
            var adjusted = incomes.slice();
            if(incomes[0] < incomes[1]) {
                var diff = Math.min(incomes[1] - incomes[0], hypotheekrenteaftrek);
                adjusted[0] -= diff + (hypotheekrenteaftrek - diff) / 2;
                adjusted[1] -= (hypotheekrenteaftrek - diff) / 2;
            } else {
                var diff = Math.min(incomes[0] - incomes[1], hypotheekrenteaftrek);
                adjusted[0] -= (hypotheekrenteaftrek - diff) / 2;
                adjusted[1] -= diff + (hypotheekrenteaftrek - diff) / 2;
            }
            return box1(incomes[0]) + box1(incomes[1]) - box1(adjusted[0]) - box1(adjusted[1]);
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
    // hypotheekrente over geheel jaar
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
    var debt = input.aankoopWaarde * input.hypotheekDeel,
        annuity = mortgage.annuity(debt, input.hypotheekRente, input.hypotheekDuur),
        buy = {
            initial: 0,
            recurring: 0,
            opportunity: 0,
            proceeds: 0,
            total: 0,
        };

    // Buying costs.
    buy.initial += input.aankoopWaarde * input.koopKosten;

    // Selling costs.
    buy.proceeds += input.aankoopWaarde * input.verkoopKosten;

    // Total sale value of house.
    buy.proceeds -= input.aankoopWaarde * Math.pow(1 + input.stijgingHuizenprijzen, input.duration);

    for(var year = 0; year < input.duration; year++) {
        var yearPaidInterest = 0,
            yearRecurringCosts = input.aankoopWaarde * input.ozbTarief + input.rioolheffingEigenaar,
            // investment return at end of year.
            yearInvestmentReturn = Math.pow(1 + input.investeringsOpbrengst, input.duration - year - 1) - 1;

        yearRecurringCosts += input.aankoopWaarde * input.insurance;
        yearRecurringCosts += input.aankoopWaarde * input.maintenance;

        if(year < input.hypotheekDuur) {
            for(var month = 0; month < 12; month++) {
                var monthPaidInterest = debt * input.hypotheekRente / 12;
                yearPaidInterest += monthPaidInterest;
                debt -= (annuity - monthPaidInterest);
                buy.recurring += annuity;
                buy.opportunity += annuity * (Math.pow(1 + input.investeringsOpbrengst, input.duration - (year + month / 12)) - 1);
            }
        }

        yearRecurringCosts -= belasting.taxRelief(input.incomes, yearPaidInterest, input.aankoopWaarde);

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
    rent.opportunity += (deposit + brokerFee) * (Math.pow(1 + input.investeringsOpbrengst, input.duration) - 1);
    rent.proceeds -= deposit;

    for(var year = 0; year < input.duration; year++) {
        var yearRent = rent.rent * Math.pow(1 + input.rentGrowth, year);
        for(var month = 0; month < 12; month++) {
            var monthRecurring = yearRent;

            rent.recurring += yearRent;
            rent.opportunity += yearRent * (Math.pow(1 + input.investeringsOpbrengst, input.duration - (year + month / 12)) - 1);
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
    aankoopWaarde: 250000,
    duration: 8,
    hypotheekDeel: 1.03,  // ratio -- @todo, de kosten voor eigen inleg als opportunity cost!
    hypotheekRente: 0.0215,
    hypotheekDuur: 30,
    stijgingHuizenprijzen: 0.02,
    ozbTarief: 0.001331,
    rioolheffingEigenaar: 105,
    koopKosten: 0.03,
    verkoopKosten: 0.04,
    investeringsOpbrengst: 0.04,
    incomes: [30000, 30000],
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

    var selectedValue = options.selectedValue;

    if(!options.y) { return {update: function(){}}; }

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

    var svg = d3.select(options.id)
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

    svg.on("mousedown", function(e) {
        d3.event.preventDefault();
        var mousemove = function() {
            var sx = d3.mouse(this)[0];
            selectedValue = options.setValue(xScale.invert(sx));
            renderSlider();
        }.bind(this);
        mousemove();
        svg.on("mousemove", mousemove);
        var clear = function() {
            svg.on("mousemove", null);
        };
        svg.on("mouseup", clear);
        svg.on("mouseout", clear);
    });

    svg.append('rect')
        .attr('class', 'click-capture')
        .style('visibility', 'hidden')
        .attr({x: 0, y: 0, width: width, height: height});

    return {update: update};
}

var durationScale = d3.scale.ordinal().domain(d3.range(1,41));
durationScale.invert = function(value) {
    var x = Math.round((value - this.rangeExtent()[0]) / this.rangeBand());

    // clamp
    x = Math.max(0, Math.min(x, this.range().length - 1));

    return this.domain()[x];
};

var form = {
    purchasePrice: d3.select("#purchasePriceInput"),
}

var graphs = {
    purchasePrice: graph({
        id: "#purchasePrice",
        selectedValue: input.aankoopWaarde,
        xScale: d3.scale.log().domain([50e3, 3e6]).clamp(true),
        xAxis: d3.svg.axis().tickFormat(d3.format("s")).tickValues([100e3, 200e3, 1e6, 2e6]),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.aankoopWaarde = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            value = Math.round(value / 1000) * 1000;
            input.aankoopWaarde = value;
            form.purchasePrice.attr("value", value);
            update();
            return value;
        }
    }),
    duration: graph({
        id: "#duration",
        selectedValue: input.duration,
        xScale: durationScale,
        xAxis: d3.svg.axis().tickValues(d3.range(10, 41, 10)),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.duration = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            input.duration = value;
            update();
            return value;
        }
    }),
    mortgageRent: graph({
        id: "#mortgageRent",
        selectedValue: input.hypotheekRente,
        xScale: d3.scale.linear().domain([0, 0.15001]).clamp(true),
        xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(4),
        sliderFormat: d3.format(".2%"),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.hypotheekRente = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            value = Math.round(value * 1e4) / 1e4;
            input.hypotheekRente = value;
            update();
            return value;
        }
    }),
    income0: graph({
        id: "#income0",
        selectedValue: input.incomes[0],
        xScale: d3.scale.linear().domain([0, 100000]).clamp(true),
        xAxis: d3.svg.axis().tickFormat(d3.format("s")).ticks(5),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.incomes[0] = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            value = Math.round(value / 1e3) * 1e3;
            input.incomes[0] = value;
            update();
            return value;
        }
    }),
    income1: graph({
        id: "#income1",
        selectedValue: input.incomes[1],
        xScale: d3.scale.linear().domain([0, 100000]).clamp(true),
        xAxis: d3.svg.axis().tickFormat(d3.format("s")).ticks(5),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.incomes[1] = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            value = Math.round(value / 1e3) * 1e3;
            input.incomes[1] = value;
            update();
            return value;
        }
    }),
    housePriceIncrease: graph({
        id: "#housePriceIncrease",
        selectedValue: input.stijgingHuizenprijzen,
        xScale: d3.scale.linear().domain([-0.05, 0.15]).clamp(true),
        xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(5),
        sliderFormat: d3.format(".2%"),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.stijgingHuizenprijzen = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            value = Math.round(value * 1e4) / 1e4;
            input.stijgingHuizenprijzen = value;
            update();
            return value;
        }
    }),
    investmentReturn: graph({
        id: "#investmentReturn",
        selectedValue: input.investeringsOpbrengst,
        xScale: d3.scale.linear().domain([-0.1, 0.2]).clamp(true),
        xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(7),
        sliderFormat: d3.format(".2%"),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.investeringsOpbrengst = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            value = Math.round(value * 1e4) / 1e4;
            input.investeringsOpbrengst = value;
            update();
            return value;
        }
    }),
    rentGrowth: graph({
        id: "#rentGrowth",
        selectedValue: input.rentGrowth,
        xScale: d3.scale.linear().domain([-0.05, 0.15]).clamp(true),
        xAxis: d3.svg.axis().tickFormat(d3.format("%")).ticks(5),
        sliderFormat: d3.format(".2%"),
        y: function(value) {
            var copy = Object.assign({}, input);
            copy.rentGrowth = value;
            return calculate(copy).rent.rent;
        },
        setValue: function(value) {
            value = Math.round(value * 1e4) / 1e4;
            input.rentGrowth = value;
            update();
            return value;
        }
    }),
};

var update = function() {
    var output = calculate(input);
    tabulate(input, output);
    labelize(input, output);

    Object.keys(graphs).forEach(function(key) {
        graphs[key].update();
    });
};

update();

window.addEventListener("scroll", function() {
    var offset = window.scrollY;
    d3.select("#calculation").style("padding-top", offset+"px");
});
