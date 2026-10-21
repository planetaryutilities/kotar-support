private import Metaobjects::SemanticMetadata;

occurrence  blackboxOccurrences [*] nonunique;
metadata def  blackbox :> SemanticMetadata {

 :>> baseType = blackboxOccurrences meta SysML::OccurrenceUsage;

}

occurrence  logicalOccurrences [*] nonunique;
metadata def  logical :> SemanticMetadata {

 :>> baseType = logicalOccurrences meta SysML::OccurrenceUsage;

}

occurrence  grayboxOccurrences [*] nonunique;
metadata def  graybox :> SemanticMetadata {

 :>> baseType = grayboxOccurrences meta SysML::OccurrenceUsage;

}

occurrence  whiteboxOccurrences [*] nonunique;
metadata def  whitebox :> SemanticMetadata {

 :>> baseType = whiteboxOccurrences meta SysML::OccurrenceUsage;

}

occurrence  physicalOccurrences [*] nonunique;
metadata def  physical :> SemanticMetadata {

 :>> baseType = physicalOccurrences meta SysML::OccurrenceUsage;

}

part  nodes [*] nonunique;

metadata def  node :> SemanticMetadata {

 :>> baseType = nodes meta SysML::PartUsage;

}

part  softwareComponents [*] nonunique;

metadata def  <sw> software :> SemanticMetadata {

 :>> baseType = softwareComponents meta SysML::PartUsage;

}

part  hardwareComponents [*] nonunique;

metadata def  <hw> hardware :> SemanticMetadata {

 :>> baseType = hardwareComponents meta SysML::PartUsage;

}

part  operators [*] nonunique;

metadata def  operator :> SemanticMetadata {

 :>> baseType = operators meta SysML::PartUsage;

}

part  storedItems [*] nonunique;

metadata def  store :> SemanticMetadata {

 :>> baseType = storedItems meta SysML::ItemUsage;

}
