package parts {
    private import ScalarValues::*;
    private import SI::*;
    private import ISQ::*;

    package 'base parts' {
        part def CadRepresentedPart {
            attribute mass :> ISQ::mass;
        }
    }

    part def Chassis :> 'base parts'::CadRepresentedPart {
        attribute wheelbase : LengthValue default 1 [cm];
    }

    part def MOACrawler {
        part chassis : Chassis {
            :>> mass default 0.1 [kg];
        }
    attribute vehicleMass : MassValue default chassis.mass;
    }
}

package CrawlerAnalysis {
    private import ISQ::*;
    private import SI::*;
    private import parts::*;
    requirement def VehicleMassRequirement {
        subject crawler : MOACrawler;
        attribute requiredMass : ISQ::MassValue;
        require constraint {
            crawler.vehicleMass < requiredMass
    }
}

// I want to parametrize requirement and subject
analysis def VehicleMassAnalysis {
    subject crawler : MOACrawler;
    in requirement massRequirement : VehicleMassRequirement{
        subject :>> crawler :> crawler;
    }
// this can be replaced by a more sophisticated expression.
    return calculatedMass : ISQ::MassValue = crawler.vehicleMass;
        objective massAnalysisObjective {
    doc 
    /* The objective of this analysis is to determine whether the
             * current crawler design configuration can satisfy the 
             * mass requirement.
             */
    require massRequirement;
    }
}

part def CrawlerContext {
    part tinycrawler : MOACrawler {
        part :>> chassis {
            attribute :>> mass = 0.4 [kg];
        }
    }
    part medcrawler : MOACrawler {
        attribute :>> chassis.mass = 2.5 [kg];
    }

    requirement maxRequiredMass : VehicleMassRequirement {
        attribute :>> requiredMass : ISQ::MassValue = 0.5 [kg];
    }

    requirement def MaxRequiredMass :> VehicleMassRequirement {
        attribute :>> requiredMass : ISQ::MassValue = 0.5 [kg];
    }

    part analysisContext {
        // Analaysis usage written without a multiplicity defaults to [0..*], give it explicit [1]
        analysis massAnalysisT : VehicleMassAnalysis[1] {
            subject :>> crawler = tinycrawler;
            in requirement massRequirement = maxRequiredMass {
            subject :>> crawler :> tinycrawler;
            }
        }
        analysis massAnalysisM : VehicleMassAnalysis {
            subject :>> crawler = medcrawler;
            in requirement massRequirement = maxRequiredMass {
            subject :>> crawler :> medcrawler;
            }
        }

        part tinycrawlerAnalyzed :> tinycrawler {
            attribute :>> vehicleMass  = massAnalysisT.calculatedMass;
        }

        part medcrawlerAnalyzed :> medcrawler {
            attribute :>> vehicleMass  = massAnalysisM.calculatedMass;
        }

        satisfy maxRequiredMass by tinycrawlerAnalyzed;
        satisfy requirement : MaxRequiredMass by tinycrawlerAnalyzed;
        }
    }
}
