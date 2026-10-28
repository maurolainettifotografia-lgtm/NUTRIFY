import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { Image } from "expo-image";
import { ExerciseIllustration, exerciseIllustration } from "@/src/components/exercise-art";
import instructionsPt from "@/src/data/exercise-instructions-pt.json";
import detailsJson from "@/src/data/exercise-details.json";
import { exerciseImages } from "@/src/data/exercise-images";
import { bodyFront } from "@/src/data/bodyFront";
import { bodyBack } from "@/src/data/bodyBack";
import { fold } from "@/src/constants";
import { spacing, useTheme } from "@/src/theme";
type Detail = { instructions: string; language: string; equipment: string; muscles: string[]; source: string; author: string; license: string; images: { file: string; author: string; source: string; license: string }[] };
const details=detailsJson as Record<string,Detail>;
const detailByName = new Map(Object.entries(details).map(([name, detail]) => [fold(name), detail]));
export function exerciseDetail(name:string): Detail | undefined {
 const detail=detailByName.get(fold(name));if(detail)return detail;
 const art=exerciseIllustration(name);
 return art?{instructions:"",language:"pt",equipment:art.equipment??"",muscles:art.muscles,source:"",author:"",license:"",images:[]}:undefined;
}
const names:Record<string,string>={chest:"Peitoral",biceps:"Bíceps",triceps:"Tríceps",deltoids:"Ombros",abs:"Abdômen",quadriceps:"Quadríceps",hamstring:"Posterior da coxa",gluteal:"Glúteos",calves:"Panturrilhas","upper-back":"Costas",trapezius:"Trapézio","lower-back":"Lombar",obliques:"Oblíquos",adductors:"Adutores",forearm:"Antebraços"};
const groups:Record<string,string[]>={peito:["chest"],costas:["upper-back"],ombros:["deltoids"],biceps:["biceps"],triceps:["triceps"],gluteos:["gluteal"],panturrilha:["calves"],abdomen:["abs"]};
type MuscleProps = { exercises: { name: string; muscle_group: string; sets?: number | unknown[] }[] };
export function MuscleSummary(props: MuscleProps) {
 const [open,setOpen]=useState(false);const {colors}=useTheme();
 if(!props.exercises.length)return null;
 return <View style={{gap:8}}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={()=>setOpen(value=>!value)} style={{padding:12,borderRadius:12,backgroundColor:colors.surfaceSecondary}}><Text style={{color:colors.brandPrimary,fontWeight:"700"}}>{open?"Ocultar mapa muscular":"Ver músculos trabalhados"}</Text></Pressable>{open&&<MemoMuscleSummaryContent {...props}/>}</View>;
}
function MuscleSummaryContent({exercises}:MuscleProps) {
 const {colors}=useTheme();
 const counts:Record<string,number>={};
 for(const e of exercises){const slugs=exerciseDetail(e.name)?.muscles;const valid=slugs?.length?slugs:groups[e.muscle_group]??[];const count=Array.isArray(e.sets)?e.sets.length:Math.max(0,Number(e.sets)||0);for(const slug of valid) counts[slug]=(counts[slug]??0)+count;}
 const active=Object.keys(counts);if(!exercises.length)return null;
 const max=Math.max(1,...Object.values(counts));
 return <View testID="muscle-summary" style={{backgroundColor:colors.surfaceSecondary,borderRadius:16,padding:spacing.md,gap:spacing.sm}}>
  <Text style={{color:colors.onSurface,fontWeight:"700",fontSize:17}}>Músculos trabalhados</Text>
  <View style={{flexDirection:"row",width:"100%"}}>{([bodyFront,bodyBack] as const).map((body,i)=><View key={i} style={{flex:1,minWidth:0,alignItems:"center"}}><Svg width="100%" height={260} viewBox={i===0?"0 0 724 1448":"724 0 724 1448"} accessibilityLabel={i===0?"Músculos: vista frontal":"Músculos: vista posterior"}>
   <Defs><LinearGradient id={`muscle-${i}`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={colors.brandPrimary}/><Stop offset="1" stopColor="#668B12"/></LinearGradient></Defs>
   {body.flatMap((part,j)=>Object.values(part.path??{}).flat().map((d,k)=><Path key={`${j}-${k}`} d={d} fill={active.includes(part.slug??"")?`url(#muscle-${i})`:colors.onSurfaceTertiary} opacity={active.includes(part.slug??"")?1:.4}/>))}
  </Svg><Text style={{color:colors.muted,fontSize:11}}>{i===0?"Frente":"Costas"}</Text></View>)}</View>
  {active.map(slug=><View key={slug} style={{gap:4}}><Text style={{color:colors.onSurfaceSecondary,fontSize:12}}>{names[slug]??slug} · {counts[slug]} séries envolvendo o grupo</Text><View style={{height:5,backgroundColor:colors.surfaceTertiary,borderRadius:4}}><View style={{height:5,width:`${counts[slug]/max*100}%`,backgroundColor:colors.brandPrimary,borderRadius:4}}/></View></View>)}
  <Text style={{color:colors.muted,fontSize:11,lineHeight:16}}>Grupos principais dos exercícios cadastrados. As séries podem envolver mais de um grupo; as barras não medem ativação muscular. Exercícios sem mapeamento não são destacados.</Text>
 </View>;
}
const MemoMuscleSummaryContent = React.memo(MuscleSummaryContent);
const equipmentPt:Record<string,string>={Barbell:"Barra",Dumbbell:"Halteres",Bench:"Banco","Incline bench":"Banco inclinado","Gym mat":"Colchonete",Kettlebell:"Kettlebell",Machine:"Máquina",Cable:"Polia","Pull-up bar":"Barra fixa","none (bodyweight exercise)":"Peso do corpo","SZ-Bar":"Barra EZ"};
export const ExerciseGuide = React.memo(function ExerciseGuide(props:{name:string;compact?:boolean}) { return <ExerciseGuideContent key={props.name} {...props}/>; });
function ExerciseGuideContent({name,compact=false}:{name:string;compact?:boolean}) {
 const {colors}=useTheme();const d=exerciseDetail(name);const [open,setOpen]=useState(!compact),[imageIndex,setImageIndex]=useState(0),[broken,setBroken]=useState(false);
 if(!d)return <Text style={{color:colors.muted,fontSize:12}}>Demonstração ainda não disponível para este exercício.</Text>;
 const img=d.images[imageIndex];const art=exerciseIllustration(name);
 const guide=(instructionsPt as Record<string,{start:string;movement:string;breathing:string;care:string;reference?:string}>)[fold(name)];
 return <View style={{gap:spacing.sm,width:"100%"}}>
  {compact&&<Pressable onPress={()=>setOpen(!open)} accessibilityRole="button"><Text style={{color:colors.brandPrimary,fontWeight:"700"}}>{open?"Ocultar demonstração":"Ver execução e equipamento"}</Text></Pressable>}
  {open&&<>
   {!!d.equipment&&<Text style={{color:colors.onSurfaceSecondary,fontSize:12}}>Equipamento: {d.equipment.split(", ").map(e=>equipmentPt[e]??e).join(", ")}</Text>}
   {art?<ExerciseIllustration name={name} art={art}/>:img&&!broken?<Image testID={`exercise-demo-${name}`} source={exerciseImages[img.file]} style={{width:"100%",height:220,borderRadius:10,backgroundColor:"#fff"}} contentFit="contain" accessibilityLabel={`Demonstração de ${name}, posição ${imageIndex+1}`} onError={()=>setBroken(true)}/>:<Text style={{color:colors.muted}}>Demonstração visual indisponível.</Text>}
   {!art&&d.images.length>1&&<View style={{flexDirection:"row",gap:12}}>{d.images.map((_,i)=><Pressable key={i} onPress={()=>{setImageIndex(i);setBroken(false);}} style={{padding:8,backgroundColor:imageIndex===i?colors.brandTertiary:colors.surfaceTertiary,borderRadius:8}}><Text style={{color:colors.onSurface}}>Posição {i+1}</Text></Pressable>)}</View>}
   {guide ? <View testID="execution-instructions" style={{gap:12,padding:14,borderRadius:14,backgroundColor:colors.surfaceSecondary}}>
     {([ ["Posição inicial",guide.start], ["Movimento",guide.movement], ["Respiração",guide.breathing], ["Cuidados",guide.care] ] as const).map(([title,text])=><View key={title} style={{gap:4}}><Text style={{color:colors.onSurface,fontWeight:"700",fontSize:13}}>{title}</Text><Text style={{color:colors.onSurfaceSecondary,fontSize:13,lineHeight:20}}>{text}</Text></View>)}
   </View> : <Text style={{color:colors.muted}}>Instruções em revisão para esta variação.</Text>}
   {!!d.source&&<Text style={{color:colors.muted,fontSize:10,lineHeight:15}}>Texto adaptado de {d.author || "colaboradores wger"} / wger. Licença: {d.license.includes("/zero/") ? "CC0" : d.license.includes("/4.0/") ? "CC BY-SA 4.0" : "CC BY-SA 3.0"}.</Text>}
   {!!art?.license&&<Text style={{color:colors.muted,fontSize:10,lineHeight:15}}>Imagem: adaptação de Everkinetic / wger. CC BY-SA 3.0.</Text>}
   {!art&&!!img&&<Text style={{color:colors.muted,fontSize:10}}>Imagem: {img.author}.</Text>}
   <View style={{flexDirection:"row",gap:12,flexWrap:"wrap"}}>
     {!!guide?.reference&&<Text accessibilityRole="link" onPress={()=>Linking.openURL(guide.reference!)} style={{color:colors.brandPrimary,fontSize:11}}>Referência de execução</Text>}
     {!!d.source&&<Text accessibilityRole="link" onPress={()=>Linking.openURL(d.source)} style={{color:colors.brandPrimary,fontSize:11}}>Fonte e créditos</Text>}
     {(!art&&img?.license||art?.license)&&<Text accessibilityRole="link" onPress={()=>Linking.openURL(art?.license??img.license)} style={{color:colors.brandPrimary,fontSize:11}}>Licença da mídia</Text>}
     {!!d.license&&<Text accessibilityRole="link" onPress={()=>Linking.openURL(d.license)} style={{color:colors.brandPrimary,fontSize:11}}>Licença do texto</Text>}
   </View>
  </>}
 </View>;
}
