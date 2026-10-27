/*0000 */ 
package rockcrawler {
	private import $::ScalarValues::Real;
	private import $::USCustomaryUnits::inch;
	private import $::SI::siemens;
	private import $::SI::minute;
	private import $::SI::second;
	private import $::ScalarValues::Natural;
	private import LogicalDriveTrainComponents::*;
	package LogicalDriveTrainComponents {
		part def Gear {
			attribute toothCount : $::ScalarValues::Natural;
		}
		/*this is a new comment */
		part def TransmissionStage {
			part inputGear : Gear;
			part outputGear : Gear;
			attribute gearRatio : $::ScalarValues::Real = outputGear.toothCount / inputGear.toothCount;
		}
		part def PortaKnuckle {
			attribute side;
			part portalTransmissionStage : TransmissionStage {
				part :>> inputGear {
					attribute :>> toothCount = 15;
				}
				part :>> outputGear {
					attribute :>> toothCount = 37;
				}
			}
		}
	}
	part portalAxleAssembly[2] {
		attribute overallRatio : $::ScalarValues::Real = transmission.transmissionRatio * leftportaKnuckle.portalTransmissionStage.gearRatio;
		attribute axleSpeed : $::ScalarValues::Real = motor.maxRPM / overallRatio * wheel.circumference;
		part housing;
		part wheel[2] {
			attribute diameter : ISQBase::LengthValue = 4.75 [$::USCustomaryUnits::inch];
			attribute pi : $::ScalarValues::Real = 3.14159;
			attribute circumference : $::ScalarValues::Real = diameter * pi;
		}
		part motor[1] {
			attribute maxRPM : ISQSpaceTime::AngularFrequencyValue = (30000 / 60) [$::SI::second ^ -1];
		}
		part leftportaKnuckle : PortaKnuckle {
			attribute :>> side = "driver";
		}
		part rightportaKnuckle : PortaKnuckle {
			attribute :>> side = "driver";
		}
		part transmission {
			part primaryTransmissionStage : TransmissionStage {
				part :>> inputGear {
					attribute :>> toothCount = 13;
				}
				part :>> outputGear {
					attribute :>> toothCount = 37;
				}
			}
			part secondaryTransmissionStage : TransmissionStage {
				part :>> inputGear {
					attribute :>> toothCount = 15;
				}
				part :>> outputGear {
					attribute :>> toothCount = 46;
				}
			}
			part thirdTransmissionStage : TransmissionStage {
				part :>> inputGear {
					attribute :>> toothCount = 15;
				}
				part :>> outputGear {
					attribute :>> toothCount = 46;
				}
			}
			attribute transmissionRatio : $::ScalarValues::Real = primaryTransmissionStage.gearRatio * secondaryTransmissionStage.gearRatio * thirdTransmissionStage.gearRatio;
		}
	}
	package requirements {
		private import $::USCustomaryUnits::'mile per hour';
		private import portalAxleAssembly::**;
		private import $::ScalarValues::Real;
		requirement <'REQ-SPD-001'> speedLimits {
			doc /*The vehicle shall be between 5 mph and 10 mph "*/
			subject axleAssemblySubject :> portalAxleAssembly;
			attribute minSpeed : ISQSpaceTime::SpeedValue = 5 [$::USCustomaryUnits::'mile per hour'];
			attribute maxSpeed : ISQSpaceTime::SpeedValue = 10 [$::USCustomaryUnits::'mile per hour'];
			assert constraint vehicleSpeed {
				axleAssemblySubject.axleSpeed > minSpeed and axleAssemblySubject.axleSpeed < maxSpeed
			}
		}
		requirement <'REQ-SPD-002'> gearRatioLimit {
			doc /*The vehicle shall have a gear ratio between 60 and 100"*/
			subject axleAssemblySubject :> portalAxleAssembly;
			attribute minGearRatio : $::ScalarValues::Real = 60;
			attribute maxGearRatio : $::ScalarValues::Real = 100;
			assert constraint vehicleSpeed {
				axleAssemblySubject.overallRatio > minGearRatio and axleAssemblySubject.overallRatio < maxGearRatio
			}
		}
	}
}
