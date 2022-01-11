export const Frag = `
precision highp float;
varying vec2 FragUv;
#define LumaPlane	InputTexture
#define LumaPlaneWidth	(InputWidthHeight.x)
#define LumaPlaneHeight	(InputWidthHeight.y)
uniform sampler2D InputTexture;
uniform vec2 InputWidthHeight;
//uniform sampler2D BackgroundImage;
const float MaxLumaDiff = 0.10;

#define ANGLE_COUNT 180
#define GLOB_RADIUS	10
const float RotationDeg = -101.0;


#define GlobRadiusOuter		( GlobRadiusOuterPx / LumaPlaneWidth )
#define GlobRadiusMid		( GlobRadiusMidPx / LumaPlaneWidth )
#define GlobRadiusInner		( GlobRadiusInnerPx / LumaPlaneWidth )

//	ray 
#define RAY_MATCH			4
#define RAY_MISMATCH		5

#define GLOB_SOLID			12
#define GLOB_TOO_NOISY		6
#define GLOB_LONER			7
#define GLOB_CORNER			8
#define GLOB_LINE			9
#define GLOB_TEE			10	//	T junction
#define GLOB_CROSS			10	//	+ junction
#define GLOB_EDGE			11	//	pixel between 2 sides
#define GLOB_DEBUGW			0
#define GLOB_LINECAP		GLOB_LONER

vec3 GetGlobColour(float GlobTypef)
{
	int GlobShowOnly = 0;
	int GlobType = int(GlobTypef);
	if ( GlobShowOnly != 0 )
	{
		if ( GlobType == GlobShowOnly )
			return vec3(0,1,0);
		return vec3(0,0,0);
	}
	
	
	if ( GlobType == GLOB_TOO_NOISY )	return vec3(1,0,1);
	if ( GlobType == GLOB_SOLID )		return vec3(0,0,0);
	if ( GlobType == GLOB_LONER )		return vec3(1,0,0);
	
	if ( GlobType == GLOB_CORNER )		return vec3(0,1,1);
	if ( GlobType == GLOB_LINE )		return vec3(1,1,1);
	if ( GlobType == GLOB_TEE )			return vec3(1,1,0);
	if ( GlobType == GLOB_CROSS )		return vec3(1,1,0);
	
	if ( GlobType == GLOB_EDGE )		return vec3(0,0,1);
	
	return vec3(1,0,1);
}	


float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

float GetLuma(vec3 Rgb)
{
	return Rgb.x;
	float Average = (Rgb.x + Rgb.y + Rgb.z) / 3.0;
	return Average;
}

bool Glob_IsColourMatch(vec2 TestColourUv,vec3 BaseColour,sampler2D ColourSource)
{
	vec3 ColourTest = texture2D( ColourSource, TestColourUv ).xyz;

	float LumaA = GetLuma( BaseColour );
	float LumaB = GetLuma( ColourTest );
	float LumaDiff = abs( LumaA - LumaB );
	return ( LumaDiff <= MaxLumaDiff );
}


int absint(int a)
{
	return a < 0 ? -a : a;
}
//	calculate the glob feature
//	x = u
//	y = v
//	z = type
//	w = firstangle
vec4 CalculateGlobFeature(vec2 uv,sampler2D ColourSource)
{
	//	double size so we can check the opposite without modulus index
	float AngleScores[ANGLE_COUNT*2];
	
	//	simplify for now by only matching against white
	//vec4 BaseColour = texture2D( ColourSource, uv );
	vec3 BaseColour = vec3(1,1,1);
	//	ignore if source is not white
	if ( !Glob_IsColourMatch( uv, BaseColour, ColourSource ) )
		return vec4( uv, float(GLOB_SOLID), 0.0 );
	
	float TotalScore = 0.0;	//	for weighting
	float HighestScore = 0.0;
	float LowestScore = 1.0;	//	low score of 0 means we're on an edge
	
	
	for ( int a=0;	a<ANGLE_COUNT;	a++ )
	{
		const bool BothDirections = false;
		
		float AngleNorm = float(a) / float(ANGLE_COUNT);
		//	gr: now walking two directions, so only doing 0-180 degrees
		float AngleDeg = mix( 0.0, BothDirections ? 180.0 : 360.0, AngleNorm ) + RotationDeg;
		float AngleRad = radians( AngleDeg );
		vec2 Offset = vec2( cos(AngleRad), sin(AngleRad) );

		int MatchCount = 0;
		int TestCount = 0;
		//	walk in both directions
		for ( int Step=BothDirections?-GLOB_RADIUS:1;	Step<=GLOB_RADIUS;	Step++ )
		{
			vec2 StepUv = uv + (Offset * (float(Step) / LumaPlaneWidth) );
			bool Match = Glob_IsColourMatch( StepUv, BaseColour, ColourSource );
			MatchCount += Match ? 1 : 0;
			TestCount += 1;
			//	when we have a lot of dilation, we can assume there wont be breaks
			if ( !Match )	break;
			
		}
		float Score = float(MatchCount)/float(TestCount);
		Score *= Score;
		AngleScores[a] = Score;
		TotalScore += Score;
		HighestScore = max( HighestScore, Score );
		LowestScore = min( LowestScore, Score );
		
		//	copy value to the opposite
		AngleScores[a+ANGLE_COUNT] = AngleScores[a];
	}
	
	//	we're on an edge, hide (as is noisy)
	//	todo: turn into a score for maxima rejection later
	//return vec4( uv, float(GLOB_DEBUGW), LowestScore/float(0.3) );
	if ( LowestScore <= float(0)/float(GLOB_RADIUS) )
		return vec4( uv, float(GLOB_SOLID), 0.0 );

	//	when dilated, this is pretty strong and relative to glob radius
	//	so we shouldnt really care
	#define MIN_SCORE 0.50	
	if ( HighestScore <= MIN_SCORE )
		return vec4( uv, float(GLOB_SOLID), 0.0 );
	float Average = TotalScore / float(ANGLE_COUNT);
	
	
	
	if ( false )
	{
		//	gr: this visualises "angle" well
		//	get first angle with highest score
		for ( int a=0;	a<ANGLE_COUNT;	a++ )
		{
			if ( AngleScores[a] == HighestScore )
			{
				float anorm = float(a)/float(ANGLE_COUNT);
				return vec4( uv, float(GLOB_DEBUGW), anorm );
			}
		}
		//return vec4( uv, float(GLOB_DEBUGW), 0.99 );
		return vec4( uv, float(GLOB_SOLID), 0.0 );
	}
	
	
	//	count dips
	bool Dropping = true;
	int Peaks = 0;
	int LastPeakAngle = -100;
	for ( int a=0;	a<ANGLE_COUNT;	a++ )
	{
		float PrevScore = AngleScores[a+0];
		float NextScore = AngleScores[a+1];
		//	going down
		if ( NextScore < PrevScore )	
		{
			//	"not a peak" as it was so small
			if ( PrevScore > Average*1.1 )
			//if ( PrevScore > HighestScore*0.2 )
			{
				//	was high
				if ( !Dropping )			
				{
					int SincePeak = a - LastPeakAngle;
					if ( SincePeak > ANGLE_COUNT/10 )
					{
						Peaks++;				//	so we've passed a peak
					}
					LastPeakAngle = a;
					
				}
			}
		}
		
		Dropping = ( NextScore < PrevScore );
	}
	
	//	wont happen
	//if ( Peaks == 0 )	return vec4( uv, float(GLOB_DEBUGW), 0.0 );
	
	//	line caps
	if ( Peaks == 1 )	return vec4( uv, float(GLOB_DEBUGW), 0.0 );
	if ( Peaks == 2 )	return vec4( uv, float(GLOB_DEBUGW), 0.5 );
	if ( Peaks == 3 )	return vec4( uv, float(GLOB_DEBUGW), 0.99 );
	//if ( Peaks == 0 )	return vec4( uv, float(GLOB_DEBUGW), 0.0 );
	//if ( Peaks == 0 )	return vec4( uv, float(GLOB_DEBUGW), 0.0 );
	{
		//float PeakNorm = float(Peaks-1)/float(3);
		//return vec4( uv, float(GLOB_DEBUGW), PeakNorm );
		return vec4( uv, float(GLOB_DEBUGW), -1.99 );
	}
	
	
	
	
	
	float MinScore = 0.70;
	float MaxAverage = 0.30;
	//if ( HighestScore < MinScore )	return vec4( uv, float(GLOB_SOLID), 0.0 );
	//if ( Average > MaxAverage )	return vec4( uv, float(GLOB_SOLID), 0.0 );

	return vec4( uv, float(GLOB_DEBUGW), HighestScore );

	//	clean out bad data
	/*
	for ( int a=0;	a<ANGLE_COUNT;	a++ )
	{
		if ( AngleScores[a] <= Average )
			AngleScores[a] = 0.0;
	}
		*/
/*
	//	do maxima filter
	for ( int a=1;	a<ANGLE_COUNT;	a++ )
	{
		float PrevScore = AngleScores[a-1];
		float NextScore = AngleScores[a+0];
		if ( PrevScore <= NextScore )
		{
			AngleScores[a-1] = 0.0;
		}
	}
	for ( int a=ANGLE_COUNT-1;	a>0;	a-- )
	{
		float PrevScore = AngleScores[a-1];
		float NextScore = AngleScores[a+0];
		if ( PrevScore >= NextScore )
		{
			AngleScores[a+0] = 0.0;
		}
	}
	*/
	/*
	int AngleCount = 0;
	for ( int a=1;	a<ANGLE_COUNT;	a++ )
	{
		bool PrevValid = AngleScores[a-1] > Average*1.0;
		bool NextValid = AngleScores[a-0] > Average*1.0;
		if ( PrevValid && !NextValid )
			AngleCount++;
	}
	
	if ( AngleCount==0 )return vec4( uv, float(GLOB_SOLID), 0.0 );
	return vec4( uv, float(GLOB_DEBUGW), float(AngleCount-1)/float(10.0) );
*/

/*

	int AngleFirst = 0;
	int AngleSecond = 0;
	int PeakCount = 0;
	int HighCount = 0;
	for ( int a=1;	a<=ANGLE_COUNT;	a++ )
	{
		float PrevScore = AngleScores[a-1];
		float ThisScore = AngleScores[a+0];
		bool WasHigh = PrevScore >= (HighestScore*0.9);
		bool NowHigh = ThisScore >= (HighestScore*0.9);
		
		HighCount += NowHigh ? 1 : 0;
		
		if ( WasHigh && !NowHigh )
		{
			if ( PeakCount == 0 )	AngleFirst = a - (HighCount/2);
			if ( PeakCount == 1 )	AngleSecond = a - (HighCount/2);
			PeakCount++;
			HighCount = 0;
		}
	}
	int AngleDiff = absint( AngleSecond - AngleFirst - (ANGLE_COUNT/2) );
	bool Opposite = (PeakCount==2) && (AngleDiff<10);
	
	//if ( Opposite )return vec4( uv, float(GLOB_SOLID), 0.0 );
	//if ( PeakCount > 3 )	return vec4( uv, float(GLOB_SOLID), 0.0 );

	//if ( PeakCount != 3)
	//	return vec4( uv, float(GLOB_SOLID), 0.0 );
	//return vec4( uv, float(GLOB_DEBUGW), float(PeakCount-1)/float(5.0) );
*/

	float Entropy = Range( 0.0, 1.0, HighestScore-Average );
	return vec4( uv, float(GLOB_DEBUGW), Entropy );
	
	//	highest score should be a chunk above the average to indicate concentrated angles
	float Score = HighestScore - Average;

	Score = Range( MinScore, 1.0, Score );
	Score = Range( MinScore, 1.0, Average );

	return vec4( uv, float(GLOB_DEBUGW), Score );
}


const vec3 Zoom = vec3(0,0,1);

vec2 ApplyZoom(vec2 uv)
{
	//	center and scale
	uv -= 0.5;
	uv /= Zoom.z;
	uv += 0.5;
	//	pan
	uv += Zoom.xy * ( 1.0 / Zoom.z );
	return uv;
}


vec2 MakeUvBlocky(vec2 uv)
{
	return uv;
	float Units = 400.0;
	uv *= Units;
	uv = floor(uv);
	uv /= Units;
	
	return uv;
}



vec3 NormalToRedGreenBlue(float Normal)
{
	if ( Normal < 0.0 )
	{
		return vec3(1,0,1);
	}
	else if ( Normal < 0.25 )
	{
		Normal = Range( 0.0, 0.25, Normal );
		return vec3( 1, Normal, 0 );
	}
	else if ( Normal <= 0.5 )
	{
		Normal = Range( 0.25, 0.50, Normal );
		return vec3( 1.0-Normal, 1, 0 );
	}
	else if ( Normal <= 0.75 )
	{
		Normal = Range( 0.50, 0.75, Normal );
		return vec3( 0, 1, Normal );
	}
	else if ( Normal <= 1.0 )
	{
		Normal = Range( 0.75, 1.00, Normal );
		return vec3( 0, 1.0-Normal, 1 );
	}

	//	>1
	return vec3( 1,1,1 );
}

void main()
{
	vec2 TextureUv = ApplyZoom( FragUv );
	vec2 SampleUv = MakeUvBlocky(TextureUv);
	vec4 Colour4 = texture2D( LumaPlane, SampleUv );
	vec3 Colour = Colour4.xyz;
	
	gl_FragColor = vec4( Colour,1 );
	if ( Colour4.w < 0.5 )
	{
		gl_FragColor = Colour4;
		return;
	}
	//return;
	//gl_FragColor = texture2D( BackgroundImage, SampleUv ).xxxw;
	
	//Colour = vec3(0,0,0);
	vec4 FeatureHere = CalculateGlobFeature( SampleUv, LumaPlane );

	if ( int(FeatureHere.z) == GLOB_SOLID )
	{
		gl_FragColor = vec4(0,0,0,0);
		return;
	}
	/*
	//	w=score
	//gl_FragColor.w = FeatureHere.w;
	
	if ( FeatureHere.w == 0.0 )
	{
		gl_FragColor = Colour4;
		return;
	}*/
	gl_FragColor.w = 1.0;

	/*
	if ( int(FeatureHere.z) == GLOB_LONER )
	{
		gl_FragColor.xyz = vec3(1,1,1);
		return;
	}
	if ( int(FeatureHere.z) == GLOB_EDGE )
	{
		gl_FragColor.xyz = vec3(0,0,0);
		return;
	}
	*/
	

	if ( int(FeatureHere.z) == GLOB_DEBUGW )
	{
		gl_FragColor.xyz = NormalToRedGreenBlue( FeatureHere.w );
		return;
	}

	
	Colour = GetGlobColour(FeatureHere.z);
	
	if ( int(FeatureHere.z) == GLOB_LINE )
	{
		//	angle
		//Colour = NormalToRedGreen( FeatureHere.w );
	}
	
	gl_FragColor.xyz = Colour;
}


`;
export default Frag;
