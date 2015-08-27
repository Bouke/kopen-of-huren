var belasting = function () {
    var box1_schijven = [
        {from: 0, to: 19822, ratio: 0.3650},
        {from: 19822, to: 33589, ratio: 0.42},
        {from: 33589, to: 57585, ratio: 0.42},
        {from: 57585, to: Infinity, ratio: 0.52},
    ];
    var box1 = function(inkomen) {
        return box1_schijven.reduce(function(sum, tier) {
            return Math.max(Math.min(tier.to, inkomen) - Math.min(tier.from, inkomen), 0) * tier.ratio + sum;
        }, 0);
    };

    var eigenwoningforfait_tarieven = [
        {from: 0, to: 12500, ratio: 0},
        {from: 12500, to: 25000, ratio: 0.003},
        {from: 25000, to: 50000, ratio: 0.0045},
        {from: 50000, to: 75000, ratio: 0.0060},
        {from: 75000, to: 1050000, ratio: 0.0075},
        {from: 1050000, to: Infinity, ratio: function(woz) { return 7875 + (woz - 1050000) * 0.0205 }},
    ];
    var eigenwoningforfait = function(woz) {
        var rate = eigenwoningforfait.filter(function(rate) { return woz >= rate.from && woz < rate.to })[0];
        return typeof(rate.ratio) === "function" ? rate.ratio(woz) : woz * rate.ratio;
    };

    var inkomstenbelasting = function(inkomen, hypotheekrente, wozWaarde) {
        return box1(inkomen - Math.max(hypotheekrente - wozWaarde, 0));
    };

    return {
        box1: box1,
        eigenwoningforfait: eigenwoningforfait,
        inkomstenbelasting: inkomstenbelasting,
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
    var debt = input.aankoopWaarde * input.hypotheekDeel / 100,
        annuity = mortgage.annuity(debt, input.hypotheekRente / 100, input.hypotheekDuur),
        duration = input.verblijfsDuur * 12,
        investmentReturn = Math.pow(1 + input.investeringsOpbrengst / 100, 1/12),
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
        };

    buy.initial += input.aankoopWaarde * input.koopKosten / 100;
    buy.proceeds += input.aankoopWaarde * input.verkoopKosten / 100;
    buy.proceeds -= input.aankoopWaarde * Math.pow(1 + input.stijgingHuizenprijzen / 100, input.verblijfsDuur);

    // @todo loop over years, and inner loop over months
    for(var month = 0; month < duration; month++) {
        var paidInterest = debt * input.hypotheekRente / 100 / 12;
        debt -= (annuity - paidInterest);
        buy.recurring += paidInterest;
        console.log(Math.pow(investmentReturn, duration - month));
        buy.opportunity += paidInterest * Math.pow(investmentReturn, duration - month);
    }

    buy.proceeds += debt;

    buy.total = buy.initial + buy.recurring + buy.opportunity + buy.proceeds;

    return {
        rent: rent,
        buy: buy,
    };
}

console.table(calculate({
    aankoopWaarde: 250000,
    verblijfsDuur: 10,
    hypotheekDeel: 103,  // percentage
    hypotheekRente: 2.15,
    hypotheekDuur: 30,
    stijgingHuizenprijzen: 2.5,
    wozTarief: 1.331,
    rioolheffingEigenaar: 105,
    koopKosten: 4.0,
    verkoopKosten: 4.0,
    investeringsOpbrengst: 6.0,
}));

