#import <React/RCTBridgeModule.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import "URLPolyfillSpec.h"
#endif

@interface URLPolyfillModule : NSObject <RCTBridgeModule>
#ifdef RCT_NEW_ARCH_ENABLED
<NativeURLPolyfillSpec>
#endif

@end