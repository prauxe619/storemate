import {
  parseIndianNumber,
  extractQuantityAndUnit,
  extractWalaPrice,
  extractMoneyAmount,
} from "../src/core/ai/IndianNumberParser";


/* ============================================================
 * NUMBER TESTS
 * ============================================================
 */

describe(
  "COUNTR Indian Number Parser",
  () => {

    test(
      "parses basic numbers",
      () => {

        expect(
          parseIndianNumber("ek")
        ).toBe(1);

        expect(
          parseIndianNumber("paanch")
        ).toBe(5);

        expect(
          parseIndianNumber("das")
        ).toBe(10);

        expect(
          parseIndianNumber("500")
        ).toBe(500);

      }
    );


    test(
      "parses Hindi compound numbers",
      () => {

        expect(
          parseIndianNumber(
            "paanch sau"
          )
        ).toBe(500);


        expect(
          parseIndianNumber(
            "paanchso"
          )
        ).toBe(500);


        expect(
          parseIndianNumber(
            "do sau"
          )
        ).toBe(200);


        expect(
          parseIndianNumber(
            "teen sau pachaas"
          )
        ).toBe(350);


        expect(
          parseIndianNumber(
            "ek hazaar"
          )
        ).toBe(1000);


        expect(
          parseIndianNumber(
            "paanch hazaar"
          )
        ).toBe(5000);


        expect(
          parseIndianNumber(
            "ek lakh"
          )
        ).toBe(100000);

      }
    );


    test(
      "parses Hindi fractions",
      () => {

        expect(
          parseIndianNumber("aadha")
        ).toBe(0.5);


        expect(
          parseIndianNumber("pauna")
        ).toBe(0.75);


        expect(
          parseIndianNumber("sawa")
        ).toBe(1.25);


        expect(
          parseIndianNumber("dedh")
        ).toBe(1.5);


        expect(
          parseIndianNumber("dhai")
        ).toBe(2.5);

      }
    );


    test(
      "parses weight quantities",
      () => {

        expect(
          extractQuantityAndUnit(
            "2 kg"
          )
        ).toMatchObject({

          quantity: 2,
          unit: "KG",

        });


        expect(
          extractQuantityAndUnit(
            "200 gram"
          )
        ).toMatchObject({

          quantity: 200,
          unit: "G",

        });


        expect(
          extractQuantityAndUnit(
            "500 gm"
          )
        ).toMatchObject({

          quantity: 500,
          unit: "G",

        });


        expect(
          extractQuantityAndUnit(
            "paanch kilo"
          )
        ).toMatchObject({

          quantity: 5,
          unit: "KG",

        });


        expect(
          extractQuantityAndUnit(
            "paanch sau gram"
          )
        ).toMatchObject({

          quantity: 500,
          unit: "G",

        });

      }
    );


    test(
      "parses fractional quantities",
      () => {

        expect(
          extractQuantityAndUnit(
            "aadha kilo"
          )
        ).toMatchObject({

          quantity: 0.5,
          unit: "KG",

        });


        expect(
          extractQuantityAndUnit(
            "pauna kilo"
          )
        ).toMatchObject({

          quantity: 0.75,
          unit: "KG",

        });


        expect(
          extractQuantityAndUnit(
            "sawa kilo"
          )
        ).toMatchObject({

          quantity: 1.25,
          unit: "KG",

        });


        expect(
          extractQuantityAndUnit(
            "dedh kilo"
          )
        ).toMatchObject({

          quantity: 1.5,
          unit: "KG",

        });


        expect(
          extractQuantityAndUnit(
            "dhai kilo"
          )
        ).toMatchObject({

          quantity: 2.5,
          unit: "KG",

        });

      }
    );


    test(
      "parses packet and bottle quantities",
      () => {

        expect(
          extractQuantityAndUnit(
            "5 packet"
          )
        ).toMatchObject({

          quantity: 5,
          unit: "PACKET",

        });


        expect(
          extractQuantityAndUnit(
            "2 packets"
          )
        ).toMatchObject({

          quantity: 2,
          unit: "PACKET",

        });


        expect(
          extractQuantityAndUnit(
            "3 bottle"
          )
        ).toMatchObject({

          quantity: 3,
          unit: "BOTTLE",

        });

      }
    );


    test(
      "parses wala prices",
      () => {

        expect(
          extractWalaPrice(
            "10 wala Kurkure"
          )
        ).toBe(10);


        expect(
          extractWalaPrice(
            "5 wala Tiger biscuit"
          )
        ).toBe(5);


        expect(
          extractWalaPrice(
            "10 wala Parle G"
          )
        ).toBe(10);


        expect(
          extractWalaPrice(
            "100 wale chawal"
          )
        ).toBe(100);


        expect(
          extractWalaPrice(
            "dus wala toothbrush"
          )
        ).toBe(10);


        expect(
          extractWalaPrice(
            "paanch wala biscuit"
          )
        ).toBe(5);


        expect(
          extractWalaPrice(
            "5 ka biscuit"
          )
        ).toBe(5);

      }
    );


    test(
      "parses numeric money",
      () => {

        expect(
          extractMoneyAmount(
            "₹500"
          )
        ).toBe(500);


        expect(
          extractMoneyAmount(
            "500 rs"
          )
        ).toBe(500);


        expect(
          extractMoneyAmount(
            "500 rupees"
          )
        ).toBe(500);


        expect(
          extractMoneyAmount(
            "500 rupaye"
          )
        ).toBe(500);

      }
    );


    test(
      "parses Hindi money",
      () => {
        expect(
  parseIndianNumber(
    "dedh sau"
  )
).toBe(150);


expect(
  parseIndianNumber(
    "dhai sau"
  )
).toBe(250);


expect(
  parseIndianNumber(
    "sawa sau"
  )
).toBe(125);


expect(
  parseIndianNumber(
    "dedh hazaar"
  )
).toBe(1500);


expect(
  parseIndianNumber(
    "dhai hazaar"
  )
).toBe(2500);

        expect(
          extractMoneyAmount(
            "paanch sau rupaye"
          )
        ).toBe(500);


        expect(
          extractMoneyAmount(
            "ek hazaar rupaye"
          )
        ).toBe(1000);


        expect(
          extractMoneyAmount(
            "dedh sau rupaye"
          )
        ).toBe(150);


        expect(
          extractMoneyAmount(
            "dhai sau rupaye"
          )
        ).toBe(250);

      }
    );


    test(
      "parses money inside a full voice command",
      () => {

        expect(
          extractMoneyAmount(
            "rahul ke khate mein paanch sau rupaye daalo"
          )
        ).toBe(500);


        expect(
          extractMoneyAmount(
            "devendra ke khate mein ek hazaar rupaye jama karo"
          )
        ).toBe(1000);

      }
    );

  }
);