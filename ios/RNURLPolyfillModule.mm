#import "URLPolyfillModule.h"
#import <React/RCTBridge.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTConvert.h>
#import <ReactCommon/RCTTurboModule.h>
#import <jsi/jsi.h>
#endif

@implementation URLPolyfillModule

RCT_EXPORT_MODULE(URLPolyfill)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (NSDictionary *)constantsToExport
{
    return @{};
}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeURLPolyfillSpecJSI>(params);
}
#endif

@end