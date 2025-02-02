// This plugin will open a window to prompt the user to enter a number, and
// it will then create that many rectangles on the screen.

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// This shows the HTML page in "ui.html".
figma.showUI(__html__, {
  width: 360,
  height: 800, // 높이를 600px로 설정
  themeColors: true // Figma의 테마 색상 사용
});

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.

// 스캔 타입 정의
type ScanType = 'page' | 'selection';

// 인스턴스 처리 함수
async function processInstance(instance: InstanceNode) {
  try {
    if (!instance || instance.type !== 'INSTANCE') return null;

    // 부모 노드가 인스턴스인지 확인
    const isNested = instance.parent?.type === 'INSTANCE';

    // 메인 컴포넌트 정보 수집
    let mainComponentInfo = null;
    let componentSetInfo = null;

    try {
      const mainComponent = await instance.getMainComponentAsync();
      if (!mainComponent) return null;

      mainComponentInfo = {
        id: mainComponent.id,
        name: mainComponent.name,
        type: mainComponent.type,
      };

      // 컴포넌트 세트 정보 수집
      if (mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
        const componentSet = mainComponent.parent;
        
        // variants 정보 수집 전에 유효성 검사
        if (componentSet.children && Array.isArray(componentSet.children)) {
          const variants = componentSet.children
            .filter(node => node && node.type === 'COMPONENT')
            .map(variant => ({
              id: variant.id,
              name: variant.name,
              type: variant.type,
              isCurrentVariant: variant.id === mainComponent.id
            }));

          componentSetInfo = {
            id: componentSet.id,
            name: componentSet.name,
            type: componentSet.type,
            variants
          };
        }
      }
    } catch (componentError) {
      console.error('Error processing component:', componentError);
      // 컴포넌트 처리 중 에러가 발생해도 기본 인스턴스 정보는 반환
    }

    return {
      id: instance.id,
      name: instance.name,
      isNested,
      mainComponentInfo,
      componentSetInfo,
    };
  } catch (error) {
    console.error('Error processing instance:', error);
    return null;
  }
}

// 프리뷰 이미지 생성 함수
async function getPreviewImage(node: ComponentNode | ComponentSetNode) {
  try {
    // 노드의 크기 확인
    const { width, height } = node;
    
    // 최대 크기 제한 (픽셀)
    const MAX_SIZE = 400;
    
    // 스케일 계산 (큰 쪽을 기준으로)
    let scale = 1;
    if (width > height) {
      scale = Math.min(1, MAX_SIZE / width);
    } else {
      scale = Math.min(1, MAX_SIZE / height);
    }

    // 최소 스케일 제한
    scale = Math.max(0.5, scale);

    // 이미지 품질 최적화 설정
    const settings = {
      format: 'PNG' as const,
      constraint: { 
        type: 'SCALE' as const, 
        value: scale
      },
      // PNG 압축 설정
      useAbsoluteBounds: false, // 불필요한 여백 제거
      contentsOnly: true, // 컨텐츠만 포함
    };

    const bytes = await node.exportAsync(settings);
    
    // bytes를 base64로 변환
    const base64 = figma.base64Encode(bytes);
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('Error generating preview:', error);
    return null;
  }
}

// 컴포넌트 기반 구조화 함수
async function restructureByComponents(instances: any[]) {
  // 컴포넌트 세트와 독립 컴포넌트를 저장할 맵
  const componentMap = new Map();

  // 중복 컴포넌트 처리 최적화
  const processedNodes = new Set(); // 이미 처리한 노드 추적

  // 각 인스턴스를 순회하며 구조화
  for (const instance of instances) {
    const { mainComponentInfo, componentSetInfo } = instance;
    
    if (componentSetInfo) {
      // 컴포넌트 세트가 있는 경우
      const setKey = componentSetInfo.id;
      if (!componentMap.has(setKey)) {
        try {
          // 디폴트 메인 컴포넌트 찾기
          const defaultVariant = await figma.getNodeByIdAsync(mainComponentInfo.id) as ComponentNode;
          
          // 라이브러리 정보 확인
          const isFromExternalLibrary = defaultVariant.remote;
          
          // 이미 처리한 노드가 아닌 경우에만 이미지 생성
          let previewUrl = null;
          if (defaultVariant && !processedNodes.has(setKey)) {
            previewUrl = await getPreviewImage(defaultVariant);
            processedNodes.add(setKey);
          }

          // 모든 variants를 먼저 맵에 추가
          const variantsMap = new Map();
          componentSetInfo.variants.forEach((variant: ComponentNode) => {
            variantsMap.set(variant.id, {
              id: variant.id,
              name: variant.name,
              type: variant.type,
              isCurrentVariant: variant.id === mainComponentInfo.id,
              instances: [],
              instanceCount: 0
            });
          });

          componentMap.set(setKey, {
            type: 'COMPONENT_SET',
            id: componentSetInfo.id,
            name: componentSetInfo.name,
            previewUrl,
            variants: variantsMap,
            totalInstanceCount: 0,
            isFromExternalLibrary
          });
        } catch (error) {
          console.error('Error getting component set:', error);
          continue;
        }
      }

      // 현재 컴포넌트 변형에 인스턴스 추가
      const componentSet = componentMap.get(setKey);
      const variantKey = mainComponentInfo.id;
      
      if (componentSet.variants.has(variantKey)) {
        const variant = componentSet.variants.get(variantKey);
        variant.instances.push({
          id: instance.id,
          name: instance.name,
          isNested: instance.isNested
        });
        variant.instanceCount++;
        componentSet.totalInstanceCount++;
      }
    } else if (mainComponentInfo) {
      // 독립 컴포넌트의 경우
      const componentKey = mainComponentInfo.id;
      if (!componentMap.has(componentKey)) {
        try {
          // 컴포넌트 노드 찾기 (비동기)
          const component = await figma.getNodeByIdAsync(componentKey) as ComponentNode;
          
          // 라이브러리 정보 확인
          const isFromExternalLibrary = component.remote;

          // 이미 처리한 노드가 아닌 경우에만 이미지 생성
          let previewUrl = null;
          if (component && !processedNodes.has(componentKey)) {
            previewUrl = await getPreviewImage(component);
            processedNodes.add(componentKey);
          }

          componentMap.set(componentKey, {
            type: 'COMPONENT',
            id: mainComponentInfo.id,
            name: mainComponentInfo.name,
            previewUrl,
            instances: [],
            instanceCount: 0,
            isFromExternalLibrary
          });
        } catch (error) {
          console.error('Error getting component:', error);
          continue;
        }
      }
      
      const component = componentMap.get(componentKey);
      component.instances.push({
        id: instance.id,
        name: instance.name,
        isNested: instance.isNested
      });
      component.instanceCount++;
    }
  }

  // Map을 배열로 변환하고 구조화
  return Array.from(componentMap.values()).map(component => {
    if (component.type === 'COMPONENT_SET') {
      const componentData = {
        type: component.type,
        id: component.id,
        name: component.name,
        previewUrl: component.previewUrl,
        variants: Array.from(component.variants.values() as Iterable<{
          id: string;
          name: string;
          type: string;
          isCurrentVariant: boolean;
          instances: any[];
        }>).map(variant => ({
          id: variant.id,
          name: variant.name,
          type: variant.type,
          isCurrentVariant: variant.isCurrentVariant,
          instances: variant.instances,
          instanceCount: variant.instances.length
        })),
        totalInstanceCount: component.totalInstanceCount,
        isFromExternalLibrary: component.isFromExternalLibrary
      };
      return componentData;
    }
    return {
      type: component.type,
      id: component.id,
      name: component.name,
      previewUrl: component.previewUrl,
      instances: component.instances,
      instanceCount: component.instances.length,
      isFromExternalLibrary: component.isFromExternalLibrary
    };
  });
}

// 스캔 영역별 레이블
const scanLabels = {
  page: 'current page',
  selection: 'selected layers'
};

// 스캔 함수
async function scanInstances(type: ScanType) {
  const initTime = Date.now();
  
  console.log(`[Step 1] Starting ${type === 'page' ? 'current page' : 'selected layer'} scan...`);
  
  let instances: InstanceNode[] = [];

  try {
    switch (type) {
      case 'page':
        const currentPage = figma.currentPage;
        console.log('[Page Info]');
        console.log({
          name: currentPage.name,
          id: currentPage.id,
          type: currentPage.type,
        });
        instances = currentPage.findAll(node => node.type === 'INSTANCE') as InstanceNode[];
        break;

      case 'selection':
        const selection = figma.currentPage.selection;
        console.log('[Layers Info]');
        console.log({
          totalSelected: selection.length,
          layers: selection.map((node, index) => ({
            index: index + 1,
            name: node.name,
            type: node.type,
            id: node.id,
            children: 'children' in node ? node.children?.length : 0
          }))
        });

        if (selection.length === 0) {
          return { instances: [], initTime, startTime: Date.now(), scanInitDuration: 0 };
        }

        // flatMap과 findAll 대신 reduce 사용
        instances = selection.reduce((acc: InstanceNode[], node: SceneNode) => {
          // findAll을 지원하는 노드인지 확인
          if ('findAll' in node) {
            const foundInstances = (node as FrameNode | ComponentNode | PageNode)
              .findAll(child => child.type === 'INSTANCE') as InstanceNode[];
            return [...acc, ...foundInstances];
          }
          // 현재 노드가 인스턴스인 경우
          if (isInstanceNode(node)) {
            return [...acc, node];
          }
          return acc;
        }, []);
        break;
    }

    const startTime = Date.now();
    const scanInitDuration = startTime - initTime;
    console.log(`[Step 1] Found ${instances.length} instances (${scanInitDuration}ms)`);

    return { instances, initTime, startTime, scanInitDuration };
  } catch (error) {
    console.error('Error during scan:', error);
    instances = figma.currentPage.findAll(node => node.type === 'INSTANCE') as InstanceNode[];
    return { instances, initTime, startTime: Date.now(), scanInitDuration: 0 };
  }
}

// 타입 가드 함수 추가
function isInstanceNode(node: SceneNode): node is InstanceNode {
  return node.type === 'INSTANCE';
}

// 메인 처리 함수
figma.ui.onmessage = async (msg: { 
  type: string, 
  scanType?: ScanType, 
  instanceId?: string,
  instanceIds?: string[]
}) => {
  if (msg.type === 'search-instances') {
    const scanType = msg.scanType || 'page';
    
    // 스캔 시작 알림
    figma.ui.postMessage({ type: 'scan-start' });
    await new Promise(resolve => setTimeout(resolve, 100)); // 메시지 표시 대기
    
    (async () => {
      try {
        // Step 1: 스캔
        const { instances, initTime, startTime, scanInitDuration } = await scanInstances(scanType);

        // Step 2: 인스턴스 분석
        console.log('[Step 2] Starting instances analysis...');
        
        // 인스턴스 분석 시작 알림
        figma.ui.postMessage({
          type: 'analysis-start',
          count: instances.length
        });
        await new Promise(resolve => setTimeout(resolve, 100)); // 메시지 표시 대기
        
        const structuredInstances = [];
        for (const instance of instances) {
          try {
            const result = await processInstance(instance);
            if (result) structuredInstances.push(result);
          } catch (instanceError) {
            console.error('Error processing single instance:', instanceError);
            continue;
          }
        }
        const scanEndTime = Date.now();
        const scanDuration = scanEndTime - startTime;
        console.log(`[Step 2] Instances analysis completed (${scanDuration}ms)`);
        console.log('[Instances]');
        console.log(structuredInstances);
        
        // Step 3: 이미지 생성
        console.log('[Step 3] Starting preview image generation...');
        const imageStartTime = Date.now();
        const componentBasedStructure = await restructureByComponents(structuredInstances);
        const imageEndTime = Date.now();
        const imageDuration = imageEndTime - imageStartTime;
        console.log(`[Step 3] Preview image generation completed (${imageDuration}ms)`);
        
        // Step 4: 컴포넌트 구조화
        console.log('[Step 4] Starting components analysis...');
        console.log('[Components]');
        console.log(componentBasedStructure);
        console.log('[Step 4] Components analysis completed');
        await new Promise(resolve => setTimeout(resolve, 100)); // 메시지 표시 대기

        // 성능 요약
        console.log('[Performance Summary]');
        console.log(`Scan: ${scanInitDuration}ms`);
        console.log(`Instance Processing: ${scanDuration}ms`);
        console.log(`Image Generation: ${imageDuration}ms`);
        console.log(`Total Time: ${imageEndTime - initTime}ms`);

        figma.ui.postMessage({
          type: 'update-results',
          data: componentBasedStructure,
          pageName: figma.currentPage.name
        });

        // 스캔 완료 알림
        figma.ui.postMessage({ type: 'scan-complete' });
      } catch (error) {
        console.error('Error during scan:', error);
      }
    })();
  } else if (msg.type === 'select-instance' && msg.instanceId) {
    // 인스턴스 선택 및 뷰 이동
    try {
      const node = await figma.getNodeByIdAsync(msg.instanceId);
      if (node && node.type !== 'DOCUMENT') {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
    } catch (error) {
      console.error('Error selecting instance:', error);
    }
  } else if (msg.type === 'select-all-instances' && msg.instanceIds) {
    try {
      const nodes = await Promise.all(
        msg.instanceIds.map((id: string) => figma.getNodeByIdAsync(id))
      );
      
      // 유효한 노드만 필터링
      const validNodes = nodes.filter((node: BaseNode | null) => node && node.type !== 'DOCUMENT') as SceneNode[];
      
      if (validNodes.length > 0) {
        // 모든 인스턴스 선택
        figma.currentPage.selection = validNodes;
        
        // 선택된 모든 노드가 보이도록 뷰포트 조정
        figma.viewport.scrollAndZoomIntoView(validNodes);
      }
    } catch (error) {
      console.error('Error selecting all instances:', error);
    }
  }
};
