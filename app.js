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

        yearRecurringCosts += input.aankoopWaarde * input.opstalVerzekering;
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
    hypotheekDeel: 1.03,  // ratio
    hypotheekRente: 0.0215,
    hypotheekDuur: 30,
    stijgingHuizenprijzen: 0.02,
    ozbTarief: 0.001331,
    rioolheffingEigenaar: 105,
    koopKosten: 0.03,
    verkoopKosten: 0.04,
    investeringsOpbrengst: 0.04,
    incomes: [48000, 50000],
    rentGrowth: 0.02,
    opstalVerzekering: 0.0005,  // jaarlijks
    maintenance: 0.005, // ratio, jaarlijks
    rentSecurityDeposit: 3, // aantal maanden
    rentBrokerFee: 0.0833, // ratio of first year's rent
};

var formatter = new Intl.NumberFormat('nl-nl', {maximumFractionDigits: 0}).format;

var labelize = function(input, output) {
    d3.select("#per-month").data([output.rent.rent]).text(formatter);
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
        .text("Op basis van " + input.duration + " jaar");
};


var graph = function(options) {
    var margin = {top: 20, right: 20, bottom: 30, left: 75},
        viewBoxWidth = 490,
        viewBoxHeight = 125,
        width = viewBoxWidth - margin.left - margin.right,
        height = viewBoxHeight - margin.top - margin.bottom;

    var selectedValue = options.selectedValue;

    if(!options.x) { return {update: function(){}}; }

    var y = d3.scale.linear()
        .range([height, 0]);

    var xAxis = d3.svg.axis()
        .scale(options.x)
        .orient("bottom");

    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left");

    var svg = d3.select(options.id)
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .attr("viewBox", "0 0 "+viewBoxWidth+" "+viewBoxHeight)
        .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
            .style("pointer-events", "all");
    svg.append("g").attr("class", "bars");

    var gx = svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")");

    var gy = svg.append("g")
        .attr("class", "y axis");

    var slider = svg.append("g").attr("class", "value");
    slider.append("path").attr("d", "M-5.5,-2.5v10l6,5.5l6,-5.5v-10z");
    slider.append("text").attr({y: 20, dy: ".5em"});

    var rangeBand = 0;

    var update = function(data) {
        rangeBand = Math.floor(width / data.length) - 1;
        var innerWidth = (rangeBand + 1) * data.length,
            leadingPadding = Math.floor((width - innerWidth) / 2 + rangeBand / 2);

        options.x.range([leadingPadding, leadingPadding + innerWidth]);
        y.domain([0, d3.max(data, function(d) { return d[1]; })]);
        gx.call(xAxis);
        gy.call(yAxis);

        var bars = svg.select(".bars").selectAll(".bar")
            .data(data);

        bars.enter().append("rect").attr("class", "bar");
        bars.exit().remove();

        bars
            .attr("x", function(d) { return options.x(d[0]); })
            .attr("width", rangeBand)
            .attr("y", function(d) { return y(d[1]); })
            .attr("height", function(d) { return height - y(d[1]); });

        renderSlider(selectedValue);
    };
    var renderSlider = function() {
        slider.select("text").text(selectedValue);
        slider.attr("transform", "translate("+(options.x(selectedValue) + rangeBand / 2)+", "+(height-8)+")");
    };

    svg.on("mousedown", function(e) {
        d3.event.preventDefault();
        var mousemove = function() {
            var sx = d3.mouse(this)[0];
            slider.attr("transform", "translate("+sx+","+(height-8)+")");
            selectedValue = options.x.invert(sx);
            slider.select("text").text(selectedValue);
        }.bind(this);
        mousemove();
        svg.on("mousemove", mousemove);
        svg.on("mouseup", function() {
            svg.on("mousemove", null);
        });
    });

    svg.append('rect')
        .attr('class', 'click-capture')
        .style('visibility', 'hidden')
        .attr({x: 0, y: 0, width: width, height: height});

    return {update: update};
}

var output = calculate(input);
tabulate(input, output);
labelize(input, output);

// @todo; the x-scale needs to coordinate with the generating function on which
// data-points to render. linear/pow scales do not know how to render bar charts
// (rangeBands). Set domain first, then generate data based on them?

var purchasePriceOptions = d3.range(0, 3e6, 50000).map(function(value) {
    var copy = Object.assign({}, input);
    copy.aankoopWaarde = value;
    return [value, calculate(copy).rent.rent];
});
var purchasePriceGraph = graph({
    id: "#purchasePrice",
    selectedValue: 250000,
    x: d3.scale.pow().exponent(0.5).domain([0, 3e6])
}).update(purchasePriceOptions);

var durationOptions = d3.range(1, 41, 1).map(function(value) {
    var copy = Object.assign({}, input);
    copy.duration = value;
    return [value, calculate(copy).rent.rent];
});
var durationGraph = graph({
    id: "#duration",
    selectedValue: 1,
    x: d3.scale.ordinal()
}).update(durationOptions);

var mortgageRentOptions = d3.range(0, 0.051, 0.00125).map(function(value) {
    var copy = Object.assign({}, input);
    copy.hypotheekRente = value;
    return [value, calculate(copy).rent.rent];
});
var mortgageRentGraph = graph({
    id: "#mortgageRent",
    selectedValue: 0
}).update(mortgageRentOptions);

var investmentReturnOptions = d3.range(0, 0.101, 0.0025).map(function(value) {
    var copy = Object.assign({}, input);
    copy.investeringsOpbrengst = value;
    return [value, calculate(copy).rent.rent];
});
var investmentReturnGraph = graph({
    id: "#investmentReturn",
    selectedValue: 0
}).update(investmentReturnOptions);
