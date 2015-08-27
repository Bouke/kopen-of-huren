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

    var inkomstenbelasting = function(inkomen, hypotheekrente, wozWaarde) {
        return box1(inkomen - Math.max(hypotheekrente - wozWaarde, 0));
    };

    var taxRelief = function(income, paidMortgageInterest, wozValue) {
        return box1(income) - box1(income - Math.max(paidMortgageInterest - eigenwoningforfait(wozValue), 0));
    };

    return {
        box1: box1,
        eigenwoningforfait: eigenwoningforfait,
        inkomstenbelasting: inkomstenbelasting,
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

var calculate = function(input) {
    var debt = input.aankoopWaarde * input.hypotheekDeel,
        annuity = mortgage.annuity(debt, input.hypotheekRente, input.hypotheekDuur),
        rent = {
            initial: 0,
            recurring: 0,
            opportunity: 0,
            proceeds: 0,
        },
        buy = {
            initial: 0,
            recurring: 0,
            opportunity: 0,
            proceeds: 0,
            taxRelief: 0,
        };

    // Buying costs.
    buy.initial += input.aankoopWaarde * input.koopKosten;

    // Selling costs.
    buy.proceeds += input.aankoopWaarde * input.verkoopKosten;

    // Total sale value of house.
    buy.proceeds -= input.aankoopWaarde * Math.pow(1 + input.stijgingHuizenprijzen, input.duration);

    for(var year = 0; year < input.duration; year++) {
        var yearPaidInterest = 0,
            yearRecurringCosts = input.aankoopWaarde * input.ozbTarief + input.rioolheffingEigenaar;

        for(var month = 0; month < 12; month++) {
            var monthPaidInterest = debt * input.hypotheekRente / 12;
            yearPaidInterest += monthPaidInterest;
            debt -= (annuity - monthPaidInterest);
            buy.recurring += annuity;
            buy.opportunity += annuity * (Math.pow(1 + input.investeringsOpbrengst, input.duration - (year + month / 12)) - 1);
        }

        buy.recurring += yearRecurringCosts;
        buy.opportunity += yearRecurringCosts * (Math.pow(1 + input.investeringsOpbrengst, input.duration - year) - 1);

        // @todo take multiple incomes into account
        buy.taxRelief -= belasting.taxRelief(input.incomes[0], yearPaidInterest, input.aankoopWaarde);
    }

    buy.proceeds += debt;

    buy.total = buy.initial + buy.recurring + buy.opportunity + buy.proceeds + buy.taxRelief;

    return {
        rent: rent,
        buy: buy,
    };
}

console.table(calculate({
    aankoopWaarde: 250000,
    duration: 10,
    hypotheekDeel: 1.03,  // ratio
    hypotheekRente: 0.0215,
    hypotheekDuur: 30,
    stijgingHuizenprijzen: 0.025,
    ozbTarief: 0.001331,
    rioolheffingEigenaar: 105,
    koopKosten: 0.04,
    verkoopKosten: 0.04,
    investeringsOpbrengst: 0.06,
    incomes: [48000, 50000],
}));

