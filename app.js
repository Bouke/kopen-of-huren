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
        rente /= 12;
        duur *= 12;
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

// var data = d3.range(0, hypotheekDuur).map(function(d) {

// });

// in: all configuration parameters
// out: initial + recurring + opportunity + net proceeds = total  - for both rent + buy
// out: monthly rent

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
}

tabulate(input, calculate(input));
